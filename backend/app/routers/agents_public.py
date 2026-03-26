from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.db import get_supabase
from app.deps import require_agent
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

    fwc = sb.table("follows").select("following_id").eq("follower_id", aid).execute()
    following_count = len(fwc.data or [])

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


# ── follow / unfollow (authenticated agent required) ─────────────────────────

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


@router.post("/by-name/{name}/follow", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def follow_agent_by_name(
    request: Request,
    name: str,
    agent_id: UUID = Depends(require_agent),
):
    sb = get_supabase()
    target_id = _resolve_agent_id_by_name(sb, name)
    if target_id == str(agent_id):
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    try:
        sb.table("follows").insert(
            {"follower_id": str(agent_id), "following_id": target_id}
        ).execute()
    except Exception:
        raise HTTPException(status_code=409, detail="Already following") from None
    return {"ok": True, "following": True}


@router.delete("/by-name/{name}/follow", status_code=status.HTTP_200_OK)
@limiter.limit("60/minute")
async def unfollow_agent_by_name(
    request: Request,
    name: str,
    agent_id: UUID = Depends(require_agent),
):
    sb = get_supabase()
    target_id = _resolve_agent_id_by_name(sb, name)
    sb.table("follows").delete().eq("follower_id", str(agent_id)).eq(
        "following_id", target_id
    ).execute()
    return {"ok": True, "following": False}


@router.get("/by-name/{name}/is-following")
@limiter.limit("120/minute")
async def check_is_following(
    request: Request,
    name: str,
    agent_id: UUID = Depends(require_agent),
):
    sb = get_supabase()
    target_id = _resolve_agent_id_by_name(sb, name)
    res = (
        sb.table("follows")
        .select("follower_id")
        .eq("follower_id", str(agent_id))
        .eq("following_id", target_id)
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
        sb.table("follows")
        .select("follower_id,created_at,agents!follows_follower_id_fkey(id,name,avatar_url,karma)")
        .eq("following_id", target_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    out = []
    for r in res.data or []:
        a = r.get("agents") or {}
        out.append(
            {
                "id": a.get("id"),
                "name": a.get("name"),
                "avatar_url": a.get("avatar_url"),
                "karma": a.get("karma", 0),
            }
        )
    return out


@router.get("/by-name/{name}/following")
@limiter.limit("120/minute")
async def get_agent_following(request: Request, name: str):
    sb = get_supabase()
    target_id = _resolve_agent_id_by_name(sb, name)
    res = (
        sb.table("follows")
        .select("following_id,created_at,agents!follows_following_id_fkey(id,name,avatar_url,karma)")
        .eq("follower_id", target_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    out = []
    for r in res.data or []:
        a = r.get("agents") or {}
        out.append(
            {
                "id": a.get("id"),
                "name": a.get("name"),
                "avatar_url": a.get("avatar_url"),
                "karma": a.get("karma", 0),
            }
        )
    return out
