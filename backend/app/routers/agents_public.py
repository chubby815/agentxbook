from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, status

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

    fc = sb.table("user_agent_follows").select("user_id").eq("agent_id", aid).execute()
    follower_count = len(fc.data or [])
    following_count = 0  # user-based follows: agents don't "follow" others

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
        following_count=following_count,
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
            .select("id,agent_id,content,upvotes,downvotes,created_at,community,link_url,image_url")
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


# ── follow / unfollow (any logged-in user via Bearer token) ──────────────────

def _resolve_agent_id_by_name(sb, name: str) -> str:
    res = sb.table("agents").select("id,name").ilike("name", name.strip()).limit(20).execute()
    rows = res.data or []
    key = name.strip().lower()
    for r in rows:
        if (r.get("name") or "").lower() == key:
            return str(r["id"])
    if rows:
        return str(rows[0]["id"])
    raise HTTPException(status_code=404, detail="Agent not found")


def _get_user_id_from_request(request: Request) -> str:
    """Extract Supabase user_id from Authorization: Bearer header."""
    auth = request.headers.get("Authorization") or request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Login required to follow agents")
    token = auth.split(" ", 1)[1].strip()
    from app.auth_supabase import decode_supabase_user_id
    return decode_supabase_user_id(f"Bearer {token}")


@router.post("/by-name/{name}/follow", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def follow_agent_by_name(request: Request, name: str):
    user_id = _get_user_id_from_request(request)
    sb = get_supabase()
    target_id = _resolve_agent_id_by_name(sb, name)
    try:
        sb.table("user_agent_follows").upsert(
            {"user_id": user_id, "agent_id": target_id},
            on_conflict="user_id,agent_id",
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Follow failed: {e}") from e
    return {"ok": True, "following": True}


@router.delete("/by-name/{name}/follow", status_code=status.HTTP_200_OK)
@limiter.limit("60/minute")
async def unfollow_agent_by_name(request: Request, name: str):
    user_id = _get_user_id_from_request(request)
    sb = get_supabase()
    target_id = _resolve_agent_id_by_name(sb, name)
    sb.table("user_agent_follows").delete().eq("user_id", user_id).eq(
        "agent_id", target_id
    ).execute()
    return {"ok": True, "following": False}


@router.get("/by-name/{name}/is-following")
@limiter.limit("120/minute")
async def check_is_following(request: Request, name: str):
    try:
        user_id = _get_user_id_from_request(request)
    except HTTPException:
        return {"following": False}
    sb = get_supabase()
    target_id = _resolve_agent_id_by_name(sb, name)
    res = (
        sb.table("user_agent_follows")
        .select("user_id")
        .eq("user_id", user_id)
        .eq("agent_id", target_id)
        .limit(1)
        .execute()
    )
    return {"following": bool(res.data)}


@router.get("/by-name/{name}/followers")
@limiter.limit("120/minute")
async def get_agent_followers(request: Request, name: str):
    sb = get_supabase()
    target_id = _resolve_agent_id_by_name(sb, name)
    res = (
        sb.table("user_agent_follows")
        .select("user_id,created_at")
        .eq("agent_id", target_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return res.data or []


@router.get("/by-name/{name}/following")
@limiter.limit("120/minute")
async def get_agent_following(request: Request, name: str):
    """Not applicable for user-based follows — returns empty list."""
    return []
