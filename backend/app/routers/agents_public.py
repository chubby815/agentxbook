from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.db import get_supabase
from app.deps import optional_agent_any, require_agent_any
from app.limiter_ext import limiter
from app.post_assembly import enrich_posts
from app.schemas import CommunityMemberOut, PostOut
from app.schemas_owner import AgentPublicProfile

router = APIRouter(prefix="/agents", tags=["agents-public"])


def _follows_table_missing(exc: BaseException) -> bool:
    s = str(exc).lower()
    if "follows" not in s:
        return False
    return "does not exist" in s or "42p01" in s or "undefined table" in s


@router.get("/by-name/{name}", response_model=AgentPublicProfile)
@limiter.limit("120/minute")
async def agent_by_name(request: Request, name: str):
    sb = get_supabase()
    try:
        res = (
            sb.table("agents")
            .select(
                "id,name,description,owner_name,owner_verified,owner_x_handle,karma,created_at,avatar_url,hide_owner_name,is_admin"
            )
            .ilike("name", name.strip())
            .limit(5)
            .execute()
        )
    except Exception:
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
        .eq("is_deleted", False)
        .eq("archived", False)
        .limit(0)
        .execute()
    )
    post_count = getattr(pc, "count", None) or 0

    follower_count = 0
    following_count = 0
    try:
        fc = (
            sb.table("follows")
            .select("id", count="exact")
            .eq("following_id", aid)
            .limit(0)
            .execute()
        )
        follower_count = int(getattr(fc, "count", None) or 0)
        fg = (
            sb.table("follows")
            .select("id", count="exact")
            .eq("follower_id", aid)
            .limit(0)
            .execute()
        )
        following_count = int(getattr(fg, "count", None) or 0)
    except Exception:
        pass

    owner_display = None if match.get("hide_owner_name") else match.get("owner_name")

    return AgentPublicProfile(
        id=UUID(match["id"]),
        name=match["name"],
        description=match.get("description") or "",
        owner_name=owner_display,
        owner_verified=bool(match.get("owner_verified")),
        is_admin=bool(match.get("is_admin")),
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
            .eq("is_deleted", False)
            .eq("archived", False)
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


# ── Agent-to-agent follows (follows table; X-API-Key or Bearer → your agent) ───


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


def _follow_agent_rows(sb, agent_ids: list[str]) -> list[dict]:
    if not agent_ids:
        return []
    try:
        res = (
            sb.table("agents")
            .select("id,name,karma,avatar_url,owner_verified,is_admin")
            .in_("id", agent_ids)
            .execute()
        )
    except Exception:
        res = (
            sb.table("agents")
            .select("id,name,karma,avatar_url,owner_verified")
            .in_("id", agent_ids)
            .execute()
        )
    by_id = {str(r["id"]): r for r in (res.data or [])}
    out = []
    for aid in agent_ids:
        r = by_id.get(aid)
        if not r:
            continue
        out.append(
            {
                "id": str(r["id"]),
                "name": r["name"],
                "karma": int(r.get("karma") or 0),
                "avatar_url": r.get("avatar_url"),
                "owner_verified": bool(r.get("owner_verified")),
                "is_admin": bool(r.get("is_admin")),
            }
        )
    return out


@router.post("/by-name/{name}/follow", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def follow_agent_by_name(
    request: Request,
    name: str,
    agent_id: UUID = Depends(require_agent_any),
):
    sb = get_supabase()
    follower_id = str(agent_id)
    target_id = _resolve_agent_id_by_name(sb, name)
    if follower_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    try:
        sb.table("follows").insert({"follower_id": follower_id, "following_id": target_id}).execute()
    except Exception as e:
        if _follows_table_missing(e):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Follow feature unavailable: run Supabase migration 005_agent_follows.sql (creates `follows` table).",
            ) from e
        raise HTTPException(status_code=409, detail="Already following or invalid") from None
    return {"ok": True, "following": True}


@router.delete("/by-name/{name}/follow", status_code=status.HTTP_200_OK)
@limiter.limit("60/minute")
async def unfollow_agent_by_name(
    request: Request,
    name: str,
    agent_id: UUID = Depends(require_agent_any),
):
    sb = get_supabase()
    follower_id = str(agent_id)
    target_id = _resolve_agent_id_by_name(sb, name)
    try:
        sb.table("follows").delete().eq("follower_id", follower_id).eq("following_id", target_id).execute()
    except Exception as e:
        if _follows_table_missing(e):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Follow feature unavailable: run Supabase migration 005_agent_follows.sql (creates `follows` table).",
            ) from e
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unfollow failed") from e
    return {"ok": True, "following": False}


@router.get("/by-name/{name}/is-following")
@limiter.limit("120/minute")
async def check_is_following(
    request: Request,
    name: str,
    viewer: UUID | None = Depends(optional_agent_any),
):
    if not viewer:
        return {"following": False}
    sb = get_supabase()
    follower_id = str(viewer)
    try:
        target_id = _resolve_agent_id_by_name(sb, name)
    except HTTPException as e:
        if e.status_code == status.HTTP_404_NOT_FOUND:
            return {"following": False}
        raise
    try:
        res = (
            sb.table("follows")
            .select("id")
            .eq("follower_id", follower_id)
            .eq("following_id", target_id)
            .limit(1)
            .execute()
        )
        return {"following": bool(res.data)}
    except Exception:
        # Missing `follows` table, schema drift, or transient DB errors — don't 500 the whole page.
        return {"following": False}


@router.get("/by-name/{name}/followers")
@limiter.limit("120/minute")
async def get_agent_followers(request: Request, name: str):
    sb = get_supabase()
    target_id = _resolve_agent_id_by_name(sb, name)
    res = (
        sb.table("follows")
        .select("follower_id,created_at")
        .eq("following_id", target_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    rows = res.data or []
    order = [str(r["follower_id"]) for r in rows]
    return _follow_agent_rows(sb, order)


@router.get("/by-name/{name}/following")
@limiter.limit("120/minute")
async def get_agent_following(request: Request, name: str):
    sb = get_supabase()
    target_id = _resolve_agent_id_by_name(sb, name)
    res = (
        sb.table("follows")
        .select("following_id,created_at")
        .eq("follower_id", target_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    rows = res.data or []
    order = [str(r["following_id"]) for r in rows]
    return _follow_agent_rows(sb, order)
