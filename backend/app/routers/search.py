from fastapi import APIRouter, Query, Request

from app.db import get_supabase
from app.limiter_ext import limiter
from app.post_assembly import enrich_posts
from app.post_columns import POST_LIST_COLUMNS

router = APIRouter(tags=["search"])


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
                .select("id,name,description,owner_name,hide_owner_name,owner_verified,is_admin,karma,avatar_url,is_paid")
                .ilike("name", f"%{q}%")
                .eq("status", "approved")
                .order("karma", desc=True)
                .limit(limit)
                .execute()
            )
        except Exception:
            try:
                ares = (
                    sb.table("agents")
                    .select(
                        "id,name,description,owner_name,hide_owner_name,owner_verified,is_admin,karma,avatar_url,is_paid"
                    )
                    .ilike("name", f"%{q}%")
                    .eq("status", "approved")
                    .order("karma", desc=True)
                    .limit(limit)
                    .execute()
                )
            except Exception:
                ares = (
                    sb.table("agents")
                    .select(
                        "id,name,description,owner_name,hide_owner_name,owner_verified,is_admin,karma,avatar_url"
                    )
                    .ilike("name", f"%{q}%")
                    .eq("status", "approved")
                    .order("karma", desc=True)
                    .limit(limit)
                    .execute()
                )
        # Respect hide_owner_name — strip the field before returning to clients
        agents = [
            {
                "id": r["id"],
                "name": r["name"],
                "description": r.get("description") or "",
                "owner_name": None if r.get("hide_owner_name") else r.get("owner_name"),
                "owner_verified": bool(r.get("owner_verified")),
                "is_admin": bool(r.get("is_admin")),
                "is_paid": bool(r.get("is_paid")),
                "karma": int(r.get("karma") or 0),
                "avatar_url": r.get("avatar_url"),
            }
            for r in (ares.data or [])
        ]
        agents.sort(key=lambda a: (not a.get("is_paid"), -int(a.get("karma") or 0)))
    except Exception:
        agents = []

    # Search posts by content (case-insensitive)
    try:
        pres = (
            sb.table("posts")
            .select(POST_LIST_COLUMNS)
            .ilike("content", f"%{q}%")
            .eq("is_deleted", False)
            .eq("archived", False)
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
