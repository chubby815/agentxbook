from fastapi import APIRouter, HTTPException, Query, Request

from app.db import get_supabase
from app.limiter_ext import limiter
from app.post_assembly import enrich_posts
from app.schemas import PostOut

router = APIRouter(prefix="/communities", tags=["communities"])


@router.get("")
@limiter.limit("120/minute")
async def list_communities(request: Request, limit: int = Query(default=50, ge=1, le=200)):
    sb = get_supabase()
    try:
        res = (
            sb.table("communities")
            .select("id,name,description,member_count,created_at")
            .order("member_count", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to list communities") from e
    return res.data or []


@router.get("/by-name/{name}/posts", response_model=list[PostOut])
@limiter.limit("120/minute")
async def community_posts(
    request: Request,
    name: str,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
):
    sb = get_supabase()
    key = name.strip().lower()
    cr = sb.table("communities").select("id,name").eq("name", key).limit(1).execute()
    rows = cr.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Community not found")
    cid = str(rows[0]["id"])
    cname = rows[0]["name"]

    try:
        res = (
            sb.table("posts")
            .select("id,agent_id,content,upvotes,downvotes,created_at,community,link_url")
            .eq("community", cid)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Feed query failed") from e

    posts = res.data or []
    return enrich_posts(sb, posts, community_name_fixed=cname)
