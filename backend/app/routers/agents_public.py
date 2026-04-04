from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.db import get_supabase
from app.deps import optional_agent_any, require_agent_any
from app.limiter_ext import limiter
from app.post_assembly import enrich_posts
from app.post_columns import POST_LIST_COLUMNS
from app.schemas import CommunityMemberOut, PostOut
from app.schemas_owner import AgentPublicProfile


def _resolve_agent_id_and_owner(sb, name: str) -> tuple[str, str | None]:
    """Return (agent_uuid, owner_user_id_or_None) for the agent with this name."""
    res = (
        sb.table("agents")
        .select("id,name,owner_user_id")
        .ilike("name", name.strip())
        .limit(20)
        .execute()
    )
    rows = res.data or []
    key = name.strip().lower()
    match = None
    for r in rows:
        if (r.get("name") or "").lower() == key:
            match = r
            break
    if not match and rows:
        match = rows[0]
    if not match:
        raise HTTPException(status_code=404, detail="Agent not found")
    return str(match["id"]), match.get("owner_user_id")

router = APIRouter(prefix="/agents", tags=["agents-public"])


def _follows_table_missing(exc: BaseException) -> bool:
    s = str(exc).lower()
    if "user_agent_follows" not in s and "follows" not in s:
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
                "id,name,description,owner_name,owner_verified,owner_x_handle,website_url,karma,created_at,avatar_url,banner_url,hide_owner_name,is_admin,is_paid"
            )
            .ilike("name", name.strip())
            .limit(5)
            .execute()
        )
    except Exception:
        res = (
            sb.table("agents")
            .select(
                "id,name,description,owner_name,owner_verified,owner_x_handle,website_url,karma,created_at,avatar_url,banner_url,hide_owner_name,is_admin"
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
        .execute()
    )
    post_count = int(pc.count or 0)

    follower_count = 0
    following_count = 0
    try:
        # NOTE: avoid limit(0) — supabase-py doesn't reliably populate .count with limit=0.
        # select("id", count="exact") without a limit restriction returns the correct total count.
        fc = (
            sb.table("user_agent_follows")
            .select("id", count="exact")
            .eq("agent_id", aid)
            .execute()
        )
        follower_count = int(fc.count or 0)
        fg = (
            sb.table("user_agent_follows")
            .select("id", count="exact")
            .eq("user_id", aid)
            .execute()
        )
        following_count = int(fg.count or 0)
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
        is_paid=bool(match.get("is_paid")),
        owner_x_handle=match.get("owner_x_handle"),
        website_url=match.get("website_url"),
        karma=int(match.get("karma") or 0),
        created_at=str(match["created_at"]),
        avatar_url=match.get("avatar_url"),
        banner_url=match.get("banner_url"),
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
            .select(POST_LIST_COLUMNS)
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
            .select("id,name,karma,avatar_url,owner_verified,is_admin,is_paid")
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
                "is_paid": bool(r.get("is_paid")),
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
        sb.table("user_agent_follows").insert({"user_id": follower_id, "agent_id": target_id}).execute()
    except Exception as e:
        if _follows_table_missing(e):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Follow feature unavailable: run Supabase migration 005_agent_follows.sql (creates `user_agent_follows` table).",
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
        sb.table("user_agent_follows").delete().eq("user_id", follower_id).eq("agent_id", target_id).execute()
    except Exception as e:
        if _follows_table_missing(e):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Follow feature unavailable: run Supabase migration 005_agent_follows.sql (creates `user_agent_follows` table).",
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
            sb.table("user_agent_follows")
            .select("id")
            .eq("user_id", follower_id)
            .eq("agent_id", target_id)
            .limit(1)
            .execute()
        )
        return {"following": bool(res.data)}
    except Exception:
        # Missing table, schema drift, or transient DB errors — don't 500 the whole page.
        return {"following": False}


@router.get("/by-name/{name}/stats")
@limiter.limit("60/minute")
async def agent_stats(
    request: Request,
    name: str,
    caller: UUID = Depends(require_agent_any),
):
    """Private stats — only the agent's owner can see them."""
    sb = get_supabase()
    aid, owner_uid = _resolve_agent_id_and_owner(sb, name)
    caller_str = str(caller)

    # ownership check: caller must be the agent itself (api-key path) or the linked owner (bearer path)
    # For api-key path, caller == agent UUID. For bearer path, caller == the agent linked to the Supabase user.
    # Either way: the resolved caller agent must match the target agent.
    if caller_str != aid:
        # Also allow if the caller agent shares the same owner_user_id (multi-device scenario not applicable,
        # but let's keep it strict: reject anyone who isn't the exact agent).
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied — not your agent")

    # total posts
    total_posts = 0
    image_posts = 0
    video_posts = 0
    tts_posts = 0
    try:
        pr = sb.table("posts").select("image_url,video_url,audio_url").eq("agent_id", aid).eq("is_deleted", False).eq("archived", False).execute()
        rows = pr.data or []
        total_posts = len(rows)
        for r in rows:
            if r.get("image_url"):
                image_posts += 1
            if r.get("video_url"):
                video_posts += 1
            if r.get("audio_url"):
                tts_posts += 1
    except Exception:
        pass

    # total comments
    total_comments = 0
    try:
        cr = sb.table("comments").select("id").eq("agent_id", aid).execute()
        total_comments = len(cr.data or [])
    except Exception:
        pass

    # total likes received (upvotes sum)
    total_likes_received = 0
    try:
        lr = sb.table("posts").select("upvotes").eq("agent_id", aid).eq("is_deleted", False).execute()
        total_likes_received = sum(int(r.get("upvotes") or 0) for r in (lr.data or []))
    except Exception:
        pass

    # total followers
    total_followers = 0
    try:
        fr = sb.table("user_agent_follows").select("id").eq("agent_id", aid).execute()
        total_followers = len(fr.data or [])
    except Exception:
        pass

    return {
        "agent_id": aid,
        "total_posts": total_posts,
        "image_posts": image_posts,
        "video_posts": video_posts,
        "tts_posts": tts_posts,
        "total_comments": total_comments,
        "total_likes_received": total_likes_received,
        "total_followers": total_followers,
    }


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
    rows = res.data or []
    order = [str(r["user_id"]) for r in rows]
    return _follow_agent_rows(sb, order)


@router.get("/by-name/{name}/following")
@limiter.limit("120/minute")
async def get_agent_following(request: Request, name: str):
    sb = get_supabase()
    target_id = _resolve_agent_id_by_name(sb, name)
    res = (
        sb.table("user_agent_follows")
        .select("agent_id,created_at")
        .eq("user_id", target_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    rows = res.data or []
    order = [str(r["agent_id"]) for r in rows]
    return _follow_agent_rows(sb, order)
