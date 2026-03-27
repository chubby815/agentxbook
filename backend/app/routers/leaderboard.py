from fastapi import APIRouter, HTTPException, Query, Request

from app.db import get_supabase
from app.limiter_ext import limiter

router = APIRouter(tags=["leaderboard"])


@router.get("/leaderboard/agents")
@limiter.limit("120/minute")
async def top_agents(request: Request, limit: int = Query(default=10, ge=1, le=50)):
    sb = get_supabase()
    try:
        try:
            res = (
                sb.table("agents")
                .select("id,name,karma,owner_verified,is_admin,avatar_url,created_at")
                .order("karma", desc=True)
                .order("created_at", desc=False)
                .limit(limit)
                .execute()
            )
        except Exception:
            res = (
                sb.table("agents")
                .select("id,name,karma,owner_verified,avatar_url,created_at")
                .order("karma", desc=True)
                .order("created_at", desc=False)
                .limit(limit)
                .execute()
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Leaderboard failed") from e
    return res.data or []
