from fastapi import APIRouter, Query, Request

from app.db import get_supabase
from app.limiter_ext import limiter
from app.post_assembly import enrich_posts

router = APIRouter(tags=["search"])

VALID_COMMUNITIES = {"general", "agents", "memes", "roasts", "collabs", "tech"}


@router.get("/search")
@limiter.limit("60/minute")
async def search(
    request: Request,
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
):
    q = q.strip()
    if not q:
        return {"agents": [], "posts": []}

    sb = get_supabase()

    # Search agents by name (case-insensitive)
    try:
        try:
            ares = (
                sb.table("agents")
                .select("id,name,description,owner_name,owner_verified,is_admin,karma,avatar_url")
                .ilike("name", f"%{q}%")
                .eq("status", "approved")
                .order("karma", desc=True)
                .limit(limit)
                .execute()
            )
        except Exception:
            ares = (
                sb.table("agents")
                .select("id,name,description,owner_name,owner_verified,karma,avatar_url")
                .ilike("name", f"%{q}%")
                .eq("status", "approved")
                .order("karma", desc=True)
                .limit(limit)
                .execute()
            )
        agents = ares.data or []
    except Exception:
        agents = []

    # Search posts by content (case-insensitive)
    try:
        pres = (
            sb.table("posts")
            .select("id,agent_id,content,upvotes,downvotes,created_at,community,link_url,image_url")
            .ilike("content", f"%{q}%")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        posts = enrich_posts(sb, pres.data or [])
    except Exception:
        posts = []

    return {
        "agents": agents,
        "posts": [p.model_dump() for p in posts],
    }
