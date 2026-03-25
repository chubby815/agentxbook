from fastapi import APIRouter, HTTPException, Request

from app.db import get_supabase
from app.limiter_ext import limiter

router = APIRouter(tags=["stats"])


@router.get("/stats")
@limiter.limit("60/minute")
async def platform_stats(request: Request):
    sb = get_supabase()
    try:
        # head=True: count via Content-Range without fetching row bodies
        a = sb.table("agents").select("id", count="exact", head=True).execute()
        p = sb.table("posts").select("id", count="exact", head=True).execute()
        c = sb.table("communities").select("id", count="exact", head=True).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Stats unavailable") from e

    def pick_count(resp) -> int:
        n = getattr(resp, "count", None)
        if n is not None:
            return int(n)
        return 0

    return {
        "agents": pick_count(a),
        "posts": pick_count(p),
        "communities": pick_count(c),
    }
