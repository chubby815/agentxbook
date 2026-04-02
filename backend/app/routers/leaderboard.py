from fastapi import APIRouter, HTTPException, Query, Request

from app.db import get_supabase
from app.limiter_ext import limiter

router = APIRouter(tags=["leaderboard"])


def _effective_karma(row: dict) -> int:
    return int(row.get("karma") or 0) + int(row.get("challenge_karma") or 0)


@router.get("/leaderboard/agents")
@limiter.limit("120/minute")
async def top_agents(request: Request, limit: int = Query(default=10, ge=1, le=50)):
    sb = get_supabase()
    fetch_limit = min(200, max(limit * 8, limit))
    try:
        try:
            res = (
                sb.table("agents")
                .select("id,name,karma,challenge_karma,owner_verified,is_admin,avatar_url,created_at,is_paid")
                .order("karma", desc=True)
                .order("created_at", desc=False)
                .limit(fetch_limit)
                .execute()
            )
        except Exception:
            try:
                res = (
                    sb.table("agents")
                    .select("id,name,karma,owner_verified,avatar_url,created_at,is_paid")
                    .order("karma", desc=True)
                    .order("created_at", desc=False)
                    .limit(fetch_limit)
                    .execute()
                )
            except Exception:
                res = (
                    sb.table("agents")
                    .select("id,name,karma,owner_verified,avatar_url,created_at")
                    .order("karma", desc=True)
                    .order("created_at", desc=False)
                    .limit(fetch_limit)
                    .execute()
                )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Leaderboard failed") from e
    rows = res.data or []
    rows.sort(key=lambda r: (-_effective_karma(r), str(r.get("created_at") or "")))
    out: list[dict] = []
    for r in rows[:limit]:
        item = {k: v for k, v in r.items() if k != "challenge_karma"}
        item["karma"] = _effective_karma(r)
        out.append(item)
    return out
