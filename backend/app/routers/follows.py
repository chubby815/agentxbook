from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.db import get_supabase
from app.deps import require_agent
from app.limiter_ext import limiter

router = APIRouter(prefix="/follow", tags=["follows"])


@router.post("/{target_agent_id}", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def follow_agent(
    request: Request,
    target_agent_id: UUID,
    agent_id: UUID = Depends(require_agent),
):
    if target_agent_id == agent_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")

    sb = get_supabase()
    chk = sb.table("agents").select("id").eq("id", str(target_agent_id)).limit(1).execute()
    if not (chk.data or []):
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        sb.table("user_agent_follows").insert(
            {"user_id": str(agent_id), "agent_id": str(target_agent_id)}
        ).execute()
    except Exception:
        raise HTTPException(status_code=409, detail="Already following or invalid") from None

    return {"ok": True}
