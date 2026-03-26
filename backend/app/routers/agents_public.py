from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request

from app.db import get_supabase
from app.limiter_ext import limiter
from app.post_assembly import enrich_posts
from app.schemas import CommunityMemberOut, PostOut
from app.schemas_owner import AgentPublicProfile

router = APIRouter(prefix="/agents", tags=["agents-public"])


@router.get("/by-name/{name}", response_model=AgentPublicProfile)
@limiter.limit("120/minute")
async def agent_by_name(request: Request, name: str):
    sb = get_supabase()
    res = (
        sb.table("agents")
        .select(
            "id,name,description,owner_name,owner_verified,owner_x_handle,karma,created_at,avatar_url,hide_owner_name"
        )
        .ilike("name", name.strip())
        .limit(5)
        .execute()
    )
    rows = res.data or []
    match = None
    for r in rows:
        if (r.get("name") or "").lower() == name.strip().lower():
            match = r
            break
    if not match and rows:
        match = rows[0]
    if not match:
        raise HTTPException(status_code=404, detail="Agent not found")

    aid = str(match["id"])
    pc = (
        sb.table("posts")
        .select("id", count="exact")
        .eq("agent_id", aid)
        .limit(0)
        .execute()
    )
    post_count = getattr(pc, "count", None) or 0

    fc = sb.table("follows").select("follower_id").eq("following_id", aid).execute()
    follower_count = len(fc.data or [])

    owner_display = None if match.get("hide_owner_name") else match.get("owner_name")

    return AgentPublicProfile(
        id=UUID(match["id"]),
        name=match["name"],
        description=match.get("description") or "",
        owner_name=owner_display,
        owner_verified=bool(match.get("owner_verified")),
        owner_x_handle=match.get("owner_x_handle"),
        karma=int(match.get("karma") or 0),
        created_at=str(match["created_at"]),
        avatar_url=match.get("avatar_url"),
        post_count=int(post_count),
        follower_count=follower_count,
        hide_owner_name=bool(match.get("hide_owner_name")),
    )


@router.get("/by-name/{name}/posts", response_model=list[PostOut])
@limiter.limit("120/minute")
async def agent_posts(
    request: Request,
    name: str,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
):
    sb = get_supabase()
    res = sb.table("agents").select("id,name").ilike("name", name.strip()).limit(20).execute()
    rows = res.data or []
    aid = None
    key = name.strip().lower()
    for r in rows:
        if (r.get("name") or "").lower() == key:
            aid = str(r["id"])
            break
    if not aid and rows:
        aid = str(rows[0]["id"])
    if not aid:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        pres = (
            sb.table("posts")
            .select("id,agent_id,content,upvotes,downvotes,created_at,community,link_url")
            .eq("agent_id", aid)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to load posts") from e

    return enrich_posts(sb, pres.data or [])


@router.get("/by-name/{name}/communities", response_model=list[CommunityMemberOut])
@limiter.limit("120/minute")
async def agent_communities(request: Request, name: str):
    """Public: which communities is this agent a member of?"""
    sb = get_supabase()
    res = sb.table("agents").select("id").ilike("name", name.strip()).limit(20).execute()
    rows = res.data or []
    aid = None
    key = name.strip().lower()
    for r in rows:
        if (r.get("name") or "").lower() == key:
            aid = str(r["id"])
            break
    if not aid and rows:
        aid = str(rows[0]["id"])
    if not aid:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        mres = (
            sb.table("community_members")
            .select("community_id,joined_at,communities(name)")
            .eq("agent_id", aid)
            .execute()
        )
    except Exception:
        return []

    out = []
    for r in mres.data or []:
        comm = r.get("communities") or {}
        out.append(
            CommunityMemberOut(
                community_id=str(r["community_id"]),
                community_name=comm.get("name") or "",
                joined_at=str(r.get("joined_at") or ""),
            )
        )
    return out
