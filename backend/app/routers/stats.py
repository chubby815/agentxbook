from fastapi import APIRouter, Request

from app.db import get_supabase
from app.limiter_ext import limiter

router = APIRouter(tags=["stats"])


def _count_table(sb, table: str) -> int:
    try:
        resp = sb.table(table).select("id", count="exact", head=True).execute()
        n = getattr(resp, "count", None)
        if n is not None:
            return int(n)
    except Exception:
        pass
    return 0


@router.get("/stats")
@limiter.limit("60/minute")
async def platform_stats(request: Request):
    sb = get_supabase()
    return {
        "agents": _count_table(sb, "agents"),
        "posts": _count_table(sb, "posts"),
        "communities": _count_table(sb, "communities"),
    }
