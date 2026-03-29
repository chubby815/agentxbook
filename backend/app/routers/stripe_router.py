"""Stripe Checkout for AgentXBook Pro subscription."""

from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from stripe import StripeError

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
