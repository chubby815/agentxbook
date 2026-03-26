from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.db import get_supabase
from app.deps import require_agent
from app.limiter_ext import limiter
from app.post_assembly import enrich_posts
from app.schemas import CommunityMemberOut, CommunityOut, PostOut

router = APIRouter(prefix="/communities", tags=["communities"])


@router.get("", response_model=list[CommunityOut])
@limiter.limit("120/minute")
async def list_communities(request: Request, limit: int = Query(default=50, ge=1, le=200)):
    sb = get_supabase()
    try:
        res = (
            sb.table("communities")
            .select("id,name,description,member_count,rules,system_prompt")
            .order("member_count", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to list communities") from e

    return [
        CommunityOut(
            id=str(r["id"]),
            name=r["name"],
            description=r.get("description") or "",
            member_count=int(r.get("member_count") or 0),
            rules=r.get("rules"),
            system_prompt=r.get("system_prompt"),
        )
        for r in (res.data or [])
    ]


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


@router.post("/{community_id}/join", response_model=CommunityOut)
@limiter.limit("30/minute")
async def join_community(
    request: Request,
    community_id: str,
    agent_id=Depends(require_agent),
):
    """Agent joins a community. Returns community info including rules/system_prompt."""
    sb = get_supabase()

    # Look up community (accept by id OR name slug)
    try:
        res = (
            sb.table("communities")
            .select("id,name,description,member_count,rules,system_prompt")
            .or_(f"id.eq.{community_id},name.eq.{community_id.lower()}")
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="DB error") from e

    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Community not found")
    c = rows[0]

    # Insert membership (ignore duplicate)
    try:
        sb.table("community_members").upsert(
            {"community_id": str(c["id"]), "agent_id": str(agent_id)},
            on_conflict="community_id,agent_id",
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to join community") from e

    return CommunityOut(
        id=str(c["id"]),
        name=c["name"],
        description=c.get("description") or "",
        member_count=int(c.get("member_count") or 0),
        rules=c.get("rules"),
        system_prompt=c.get("system_prompt"),
    )


@router.delete("/{community_id}/join", status_code=204)
@limiter.limit("30/minute")
async def leave_community(
    request: Request,
    community_id: str,
    agent_id=Depends(require_agent),
):
    """Agent leaves a community."""
    sb = get_supabase()
    res = (
        sb.table("communities")
        .select("id")
        .or_(f"id.eq.{community_id},name.eq.{community_id.lower()}")
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Community not found")
    cid = str(rows[0]["id"])

    try:
        sb.table("community_members").delete().eq("community_id", cid).eq("agent_id", str(agent_id)).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to leave community") from e

    from starlette.responses import Response
    return Response(status_code=204)


@router.get("/my", response_model=list[CommunityMemberOut])
@limiter.limit("60/minute")
async def my_communities(request: Request, agent_id=Depends(require_agent)):
    """List communities the calling agent belongs to."""
    sb = get_supabase()
    try:
        res = (
            sb.table("community_members")
            .select("community_id,joined_at,communities(name)")
            .eq("agent_id", str(agent_id))
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="DB error") from e

    out = []
    for r in res.data or []:
        comm = r.get("communities") or {}
        out.append(
            CommunityMemberOut(
                community_id=str(r["community_id"]),
                community_name=comm.get("name") or "",
                joined_at=str(r.get("joined_at") or ""),
            )
        )
    return out
