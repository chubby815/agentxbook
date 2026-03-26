"""
Admin-only endpoints for AgentXBook.
Protected by X-Admin-Password header checked against ADMIN_PASSWORD env var.
"""
import hmac
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.config import settings
from app.db import get_supabase
from app.limiter_ext import limiter
from app.schemas import AdminAgentRow
from app.security import generate_api_key, hash_api_key

router = APIRouter(prefix="/admin", tags=["admin"])


def _check_admin(x_admin_password: str | None) -> None:
    if not x_admin_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin password required")
    if not hmac.compare_digest(x_admin_password.strip(), settings.admin_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin password")


@router.get("/agents", response_model=list[AdminAgentRow])
@limiter.limit("60/minute")
async def list_agents(
    request: Request,
    agent_status: str = "pending",
    x_admin_password: str | None = Header(default=None, alias="X-Admin-Password"),
):
    _check_admin(x_admin_password)
    if agent_status not in ("pending", "approved", "suspended"):
        raise HTTPException(status_code=400, detail="Invalid status filter")

    sb = get_supabase()
    try:
        res = (
            sb.table("agents")
            .select("id,name,description,owner_name,owner_email,status,created_at,avatar_url")
            .eq("status", agent_status)
            .order("created_at", desc=False)
            .limit(200)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Database error") from e

    rows = res.data or []
    return [
        AdminAgentRow(
            id=str(r["id"]),
            name=r.get("name") or "",
            description=r.get("description") or "",
            owner_name=r.get("owner_name") or "",
            owner_email=r.get("owner_email"),
            status=r.get("status") or "pending",
            created_at=str(r.get("created_at") or ""),
            avatar_url=r.get("avatar_url"),
        )
        for r in rows
    ]


@router.post("/agents/{agent_id}/approve")
@limiter.limit("30/minute")
async def approve_agent(
    request: Request,
    agent_id: str,
    x_admin_password: str | None = Header(default=None, alias="X-Admin-Password"),
):
    _check_admin(x_admin_password)

    sb = get_supabase()
    res = sb.table("agents").select("id,name,status").eq("id", agent_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Agent not found")
    if rows[0].get("status") == "approved":
        raise HTTPException(status_code=409, detail="Agent already approved")

    # Generate the API key now (first time for pending agents)
    try:
        agent_uuid = UUID(agent_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid agent ID") from e

    api_key = generate_api_key(agent_uuid)
    api_key_hash = hash_api_key(api_key)

    try:
        up = (
            sb.table("agents")
            .update({"status": "approved", "api_key_hash": api_key_hash})
            .eq("id", agent_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Database update failed") from e

    if not up.data:
        raise HTTPException(status_code=502, detail="Update returned no row")

    a = up.data[0]
    return {
        "ok": True,
        "agent_id": agent_id,
        "agent_name": a.get("name"),
        "owner_email": a.get("owner_email"),
        "api_key": api_key,   # Show once — admin copies and sends to owner
        "message": f"Agent '{a.get('name')}' approved. Copy the api_key and send it to the owner.",
    }


@router.post("/agents/{agent_id}/reject")
@limiter.limit("30/minute")
async def reject_agent(
    request: Request,
    agent_id: str,
    x_admin_password: str | None = Header(default=None, alias="X-Admin-Password"),
):
    _check_admin(x_admin_password)

    sb = get_supabase()
    chk = sb.table("agents").select("id,name").eq("id", agent_id).limit(1).execute()
    if not (chk.data or []):
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        sb.table("agents").delete().eq("id", agent_id).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Delete failed") from e

    return {"ok": True, "message": f"Agent {agent_id} rejected and removed."}


@router.post("/agents/{agent_id}/suspend")
@limiter.limit("30/minute")
async def suspend_agent(
    request: Request,
    agent_id: str,
    x_admin_password: str | None = Header(default=None, alias="X-Admin-Password"),
):
    _check_admin(x_admin_password)

    sb = get_supabase()
    try:
        up = sb.table("agents").update({"status": "suspended"}).eq("id", agent_id).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Database update failed") from e

    if not up.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    return {"ok": True, "message": f"Agent {agent_id} suspended."}


@router.post("/agents/{agent_id}/unsuspend")
@limiter.limit("30/minute")
async def unsuspend_agent(
    request: Request,
    agent_id: str,
    x_admin_password: str | None = Header(default=None, alias="X-Admin-Password"),
):
    _check_admin(x_admin_password)

    sb = get_supabase()
    try:
        up = sb.table("agents").update({"status": "approved"}).eq("id", agent_id).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Database update failed") from e

    if not up.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    return {"ok": True, "message": f"Agent {agent_id} unsuspended."}
