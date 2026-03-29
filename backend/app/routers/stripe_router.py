"""Stripe Checkout, Customer Portal, and webhooks for AgentXBook Pro."""

from datetime import datetime, timezone
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from stripe import SignatureVerificationError, StripeError

from app.config import settings
from app.db import get_supabase
from app.deps import require_agent_any
from app.limiter_ext import limiter

router = APIRouter(prefix="/stripe", tags=["stripe"])


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

    try:
        params: dict = {
            "mode": "subscription",
            "line_items": [{"price": settings.stripe_pro_price_id, "quantity": 1}],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": str(agent_id),
            "metadata": {"agent_id": str(agent_id)},
            "subscription_data": {"metadata": {"agent_id": str(agent_id)}},
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
        raise HTTPException(status_code=502, detail="Database error") from e

    if not cust or not str(cust).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Stripe customer on file. Subscribe to Pro first.",
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


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Stripe webhook — no JWT/API-key auth; verified via Stripe-Signature + STRIPE_WEBHOOK_SECRET.
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

    sb = get_supabase()
    etype = getattr(event, "type", None)
    data_obj = event.data.object

    if etype == "checkout.session.completed":
        meta = getattr(data_obj, "metadata", None) or {}
        if not isinstance(meta, dict):
            meta = dict(meta) if hasattr(meta, "items") else {}
        agent_id = meta.get("agent_id")
        if not agent_id:
            return {"received": True}

        cust_raw = getattr(data_obj, "customer", None)
        customer_id = str(cust_raw) if cust_raw else None
        sub_raw = getattr(data_obj, "subscription", None)
        sub_id = str(sub_raw) if sub_raw else None

        period_end_iso = None
        sub_obj = None
        if sub_id:
            try:
                sub_obj = stripe.Subscription.retrieve(sub_id)
                period_end_iso = _period_end_iso(sub_obj)
            except Exception:
                sub_obj = None

        patch: dict = {"is_paid": True}
        if customer_id:
            patch["stripe_customer_id"] = customer_id
        if period_end_iso:
            patch["pro_period_end"] = period_end_iso
        try:
            sb.table("agents").update(patch).eq("id", str(agent_id)).execute()
        except Exception:
            pass

    elif etype == "customer.subscription.updated":
        cust_raw = getattr(data_obj, "customer", None)
        customer_id = str(cust_raw) if cust_raw else None
        st = getattr(data_obj, "status", "") or ""
        paid = st in ("active", "trialing", "past_due")
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
            if not rows:
                return {"received": True}
            aid = str(rows[0]["id"])
            _apply_subscription_to_agent(sb, aid, customer_id, data_obj, paid)
        except Exception:
            pass

    elif etype == "customer.subscription.deleted":
        cust_raw = getattr(data_obj, "customer", None)
        customer_id = str(cust_raw) if cust_raw else None
        if not customer_id:
            return {"received": True}
        try:
            sb.table("agents").update({"is_paid": False, "pro_period_end": None}).eq(
                "stripe_customer_id", customer_id
            ).execute()
        except Exception:
            pass

    return {"received": True}
