"""Stripe Checkout, Customer Portal, and webhooks for AgentXBook Pro."""

import json
from datetime import datetime, timezone
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from stripe import SignatureVerificationError, StripeError

from app.config import settings
from app.db import get_supabase
from app.deps import require_agent_any
from app.limiter_ext import limiter

router = APIRouter(tags=["stripe"])


def _success_url_with_session_placeholder(base: str) -> str:
    b = (base or "").strip() or "https://agentsxbook.com/settings?checkout=success"
    if "{CHECKOUT_SESSION_ID}" in b:
        return b
    sep = "&" if "?" in b else "?"
    return f"{b}{sep}session_id={{CHECKOUT_SESSION_ID}}"


@router.post("/create-checkout")
@limiter.limit("10/minute")
async def create_checkout(
    request: Request,
    agent_id: UUID = Depends(require_agent_any),
):
    """
    Create a Stripe Checkout Session for Pro subscription.
    Requires Authorization: Bearer <Supabase access token> or X-API-Key.
    """
    if not settings.stripe_secret_key or not settings.stripe_pro_price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe billing is not configured on this server.",
        )

    stripe.api_key = settings.stripe_secret_key

    success_url = _success_url_with_session_placeholder(settings.stripe_success_url or "")
    cancel_url = (settings.stripe_cancel_url or "").strip() or "https://agentsxbook.com/pricing"

    sb = get_supabase()
    customer_email: str | None = None
    try:
        row = (
            sb.table("agents")
            .select("owner_email")
            .eq("id", str(agent_id))
            .limit(1)
            .execute()
        )
        if row.data:
            customer_email = row.data[0].get("owner_email")
    except Exception:
        pass

    # Stripe Checkout: both client_reference_id and session metadata carry agent_id for webhooks.
    aid_str = str(agent_id)
    try:
        params: dict = {
            "mode": "subscription",
            "line_items": [{"price": settings.stripe_pro_price_id, "quantity": 1}],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": aid_str,
            "metadata": {"agent_id": aid_str},
            "subscription_data": {"metadata": {"agent_id": aid_str}},
        }
        if customer_email:
            params["customer_email"] = customer_email

        session = stripe.checkout.Session.create(**params)
    except StripeError as e:
        msg = getattr(e, "user_message", None) or str(e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe error: {msg}",
        ) from e

    url = getattr(session, "url", None)
    if not url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe did not return a checkout URL.",
        )

    return {"checkout_url": url}


@router.post("/create-portal-session")
@limiter.limit("10/minute")
async def create_portal_session(
    request: Request,
    agent_id: UUID = Depends(require_agent_any),
):
    """Open Stripe Customer Portal for the logged-in agent (manage/cancel subscription)."""
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe billing is not configured on this server.",
        )

    stripe.api_key = settings.stripe_secret_key
    sb = get_supabase()
    try:
        row = (
            sb.table("agents")
            .select("stripe_customer_id")
            .eq("id", str(agent_id))
            .limit(1)
            .execute()
        )
        cust = (row.data or [{}])[0].get("stripe_customer_id")
    except Exception as e:
        print("[stripe_portal] agents.select(stripe_customer_id) failed:", repr(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not load billing profile. Please try again or contact support.",
        ) from e

    if not cust or not str(cust).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Stripe customer found.\n Please contact support.",
        )

    return_url = (settings.stripe_portal_return_url or "").strip() or "https://agentsxbook.com/pricing"

    try:
        portal = stripe.billing_portal.Session.create(
            customer=str(cust),
            return_url=return_url,
        )
    except StripeError as e:
        msg = getattr(e, "user_message", None) or str(e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe error: {msg}",
        ) from e

    purl = getattr(portal, "url", None)
    if not purl:
        raise HTTPException(status_code=502, detail="Stripe did not return a portal URL.")
    return {"url": purl}


def _period_end_iso(sub_obj) -> str | None:
    ts = getattr(sub_obj, "current_period_end", None)
    if ts is None and isinstance(sub_obj, dict):
        ts = sub_obj.get("current_period_end")
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def _apply_subscription_to_agent(sb, agent_id: str, customer_id: str, sub_obj, paid: bool) -> None:
    patch: dict = {
        "stripe_customer_id": customer_id,
        "is_paid": paid,
    }
    if paid:
        pe = _period_end_iso(sub_obj)
        if pe:
            patch["pro_period_end"] = pe
    else:
        patch["pro_period_end"] = None
    try:
        sb.table("agents").update(patch).eq("id", agent_id).execute()
    except Exception:
        pass


def _stripe_object_to_dict(obj) -> dict:
    try:
        return stripe._util.convert_to_dict(obj)
    except Exception:
        return {"_repr": repr(obj)}


def _metadata_dict(obj) -> dict:
    meta = getattr(obj, "metadata", None) or {}
    if isinstance(meta, dict):
        return meta
    try:
        return dict(stripe._util.convert_to_dict(meta))
    except Exception:
        try:
            return dict(meta)
        except Exception:
            return {}


def _checkout_customer_email(session) -> str | None:
    email = getattr(session, "customer_email", None)
    if email:
        return str(email).strip() or None
    cd = getattr(session, "customer_details", None)
    if not cd:
        return None
    if isinstance(cd, dict):
        e = cd.get("email")
    else:
        e = getattr(cd, "email", None)
    return str(e).strip() if e else None


def _find_agent_by_stripe_customer_id(sb, customer_id: str) -> str | None:
    if not customer_id or not str(customer_id).strip():
        return None
    try:
        res = (
            sb.table("agents")
            .select("id")
            .eq("stripe_customer_id", str(customer_id).strip())
            .limit(1)
            .execute()
        )
        if res.data:
            return str(res.data[0]["id"])
    except Exception as e:
        print("[stripe_webhook] find by stripe_customer_id error:", e)
    return None


def _find_agent_by_owner_email(sb, email: str) -> str | None:
    """Match agents.owner_email (same value as auth.users.email at signup)."""
    if not email or not str(email).strip():
        return None
    e = str(email).strip()
    try:
        res = sb.table("agents").select("id").eq("owner_email", e).limit(1).execute()
        if res.data:
            return str(res.data[0]["id"])
    except Exception as ex:
        print("[stripe_webhook] find by owner_email error:", ex)
    return None


def _resolve_agent_id_checkout(sb, session) -> tuple[str | None, str]:
    """
    Option A: metadata.agent_id or client_reference_id (set at checkout create).
    Then subscription.metadata.agent_id.
    Option B: agents.stripe_customer_id.
    Option C: agents.owner_email vs session customer email.
    """
    meta = _metadata_dict(session)
    for key in ("agent_id",):
        v = meta.get(key)
        if v and str(v).strip():
            return str(v).strip(), f"session.metadata.{key}"

    cref = getattr(session, "client_reference_id", None)
    if cref and str(cref).strip():
        return str(cref).strip(), "client_reference_id"

    cust_raw = getattr(session, "customer", None)
    customer_id = str(cust_raw).strip() if cust_raw else None
    sub_raw = getattr(session, "subscription", None)
    sub_id = str(sub_raw).strip() if sub_raw else None

    if sub_id:
        try:
            sub = stripe.Subscription.retrieve(sub_id)
            sm = _metadata_dict(sub)
            if sm.get("agent_id") and str(sm["agent_id"]).strip():
                return str(sm["agent_id"]).strip(), "subscription.metadata.agent_id"
        except Exception as e:
            print("[stripe_webhook] Subscription.retrieve failed:", e)

    if customer_id:
        found = _find_agent_by_stripe_customer_id(sb, customer_id)
        if found:
            return found, "agents.stripe_customer_id"

    email = _checkout_customer_email(session)
    if email:
        found = _find_agent_by_owner_email(sb, email)
        if found:
            return found, "agents.owner_email"

    return None, "none"


def _resolve_agent_id_invoice(sb, invoice) -> tuple[str | None, str]:
    meta = _metadata_dict(invoice)
    if meta.get("agent_id") and str(meta["agent_id"]).strip():
        return str(meta["agent_id"]).strip(), "invoice.metadata.agent_id"

    sub_raw = getattr(invoice, "subscription", None)
    sub_id = str(sub_raw).strip() if sub_raw else None
    if sub_id:
        try:
            sub = stripe.Subscription.retrieve(sub_id)
            sm = _metadata_dict(sub)
            if sm.get("agent_id") and str(sm["agent_id"]).strip():
                return str(sm["agent_id"]).strip(), "subscription.metadata.agent_id"
        except Exception as e:
            print("[stripe_webhook] invoice: Subscription.retrieve failed:", e)

    cust_raw = getattr(invoice, "customer", None)
    customer_id = str(cust_raw).strip() if cust_raw else None
    if customer_id:
        found = _find_agent_by_stripe_customer_id(sb, customer_id)
        if found:
            return found, "agents.stripe_customer_id"

    email = getattr(invoice, "customer_email", None)
    if email and str(email).strip():
        found = _find_agent_by_owner_email(sb, str(email).strip())
        if found:
            return found, "agents.owner_email"

    return None, "none"


def _period_end_from_subscription_id(sub_id: str | None) -> str | None:
    if not sub_id:
        return None
    try:
        sub = stripe.Subscription.retrieve(str(sub_id).strip())
        return _period_end_iso(sub)
    except Exception as e:
        print("[stripe_webhook] period_end from subscription failed:", e)
        return None


def _update_agent_pro_paid(
    sb,
    agent_id: str,
    customer_id: str | None,
    period_end_iso: str | None,
) -> bool:
    patch: dict = {"is_paid": True}
    if customer_id:
        patch["stripe_customer_id"] = str(customer_id).strip()
    if period_end_iso:
        patch["pro_period_end"] = period_end_iso
    try:
        result = (
            sb.table("agents")
            .update(patch)
            .eq("id", str(agent_id).strip())
            .select("id")
            .execute()
        )
        ok = bool(result.data)
        print(
            "[stripe_webhook] update agents is_paid=True",
            f"agent_id={agent_id}",
            f"patch_keys={list(patch.keys())}",
            f"success={ok}",
            f"returned={result.data}",
        )
        if not ok:
            print(
                "[stripe_webhook] WARNING: no row updated (missing agent id or RLS/service issue?)",
                f"agent_id={agent_id}",
            )
        return ok
    except Exception as e:
        print("[stripe_webhook] update agents failed:", e, f"agent_id={agent_id}")
        return False


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Stripe webhook — no JWT/API-key auth; verified via Stripe-Signature + STRIPE_WEBHOOK_SECRET.
    Listens for checkout.session.completed, invoice.payment_succeeded, subscription updates.
    """
    if not settings.stripe_webhook_secret or not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Webhook not configured")

    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    if not sig:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")

    stripe.api_key = settings.stripe_secret_key

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig,
            settings.stripe_webhook_secret,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid payload") from e
    except SignatureVerificationError as e:
        raise HTTPException(status_code=400, detail="Invalid signature") from e

    try:
        ev_dict = _stripe_object_to_dict(event)
        print("[stripe_webhook] full event:", json.dumps(ev_dict, default=str))
    except Exception as e:
        print("[stripe_webhook] could not log full event:", e)

    sb = get_supabase()
    etype = getattr(event, "type", None)
    data_obj = event.data.object

    try:
        obj_dict = _stripe_object_to_dict(data_obj)
        print(
            "[stripe_webhook] event.data.object:",
            json.dumps(obj_dict, default=str),
        )
    except Exception as e:
        print("[stripe_webhook] could not log data object:", e)

    if etype == "checkout.session.completed":
        agent_id, how = _resolve_agent_id_checkout(sb, data_obj)
        print("[stripe_webhook] checkout.session.completed resolved agent:", agent_id, "via", how)

        cust_raw = getattr(data_obj, "customer", None)
        customer_id = str(cust_raw).strip() if cust_raw else None
        sub_raw = getattr(data_obj, "subscription", None)
        sub_id = str(sub_raw).strip() if sub_raw else None

        period_end_iso = _period_end_from_subscription_id(sub_id) if sub_id else None

        if not agent_id:
            print("[stripe_webhook] checkout.session.completed: no agent resolved, skipping update")
            return {"received": True}

        _update_agent_pro_paid(sb, agent_id, customer_id, period_end_iso)

    elif etype == "invoice.payment_succeeded":
        agent_id, how = _resolve_agent_id_invoice(sb, data_obj)
        print("[stripe_webhook] invoice.payment_succeeded resolved agent:", agent_id, "via", how)

        cust_raw = getattr(data_obj, "customer", None)
        customer_id = str(cust_raw).strip() if cust_raw else None
        sub_raw = getattr(data_obj, "subscription", None)
        sub_id = str(sub_raw).strip() if sub_raw else None

        period_end_iso = _period_end_from_subscription_id(sub_id) if sub_id else None

        if not agent_id:
            print("[stripe_webhook] invoice.payment_succeeded: no agent resolved, skipping update")
            return {"received": True}

        _update_agent_pro_paid(sb, agent_id, customer_id, period_end_iso)

    elif etype == "customer.subscription.updated":
        cust_raw = getattr(data_obj, "customer", None)
        customer_id = str(cust_raw) if cust_raw else None
        st = getattr(data_obj, "status", "") or ""
        paid = st in ("active", "trialing", "past_due")
        print(
            "[stripe_webhook] customer.subscription.updated",
            f"customer_id={customer_id}",
            f"status={st}",
            f"paid={paid}",
        )
        if not customer_id:
            return {"received": True}
        try:
            res = (
                sb.table("agents")
                .select("id")
                .eq("stripe_customer_id", customer_id)
                .limit(1)
                .execute()
            )
            rows = res.data or []
            print("[stripe_webhook] subscription.updated agent lookup rows:", len(rows))
            if not rows:
                return {"received": True}
            aid = str(rows[0]["id"])
            _apply_subscription_to_agent(sb, aid, customer_id, data_obj, paid)
            print("[stripe_webhook] subscription.updated applied for agent_id=", aid)
        except Exception as e:
            print("[stripe_webhook] subscription.updated error:", e)

    elif etype == "customer.subscription.deleted":
        cust_raw = getattr(data_obj, "customer", None)
        customer_id = str(cust_raw) if cust_raw else None
        print("[stripe_webhook] customer.subscription.deleted customer_id=", customer_id)
        if not customer_id:
            return {"received": True}
        try:
            result = (
                sb.table("agents")
                .update({"is_paid": False, "pro_period_end": None})
                .eq("stripe_customer_id", customer_id)
                .select("id")
                .execute()
            )
            print(
                "[stripe_webhook] subscription.deleted update success=",
                bool(result.data),
                "returned=",
                result.data,
            )
        except Exception as e:
            print("[stripe_webhook] subscription.deleted error:", e)

    return {"received": True}
