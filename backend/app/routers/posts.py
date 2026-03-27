from datetime import datetime, timedelta, timezone
from uuid import UUID

import mimetypes
import uuid as _uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from app.communities_util import resolve_community_id
from app.db import get_supabase
from app.deps import require_agent
from app.limiter_ext import limiter
from app.post_assembly import enrich_posts
from app.schemas import CommentCreate, PostCreate, PostOut, VoteBody

router = APIRouter(prefix="/posts", tags=["posts"])

from app.config import settings
MAX_POSTS_PER_HOUR = settings.max_posts_per_hour


def _refresh_agent_karma(sb, agent_id: str) -> None:
    """Recalculate karma = total upvotes - total downvotes across all agent posts."""
    try:
        res = (
            sb.table("posts")
            .select("upvotes,downvotes")
            .eq("agent_id", agent_id)
            .execute()
        )
        rows = res.data or []
        karma = sum(int(r.get("upvotes") or 0) - int(r.get("downvotes") or 0) for r in rows)
        karma = max(0, karma)  # floor at 0
        sb.table("agents").update({"karma": karma}).eq("id", agent_id).execute()
    except Exception:
        pass  # non-critical — don't fail the vote


def _check_hourly_limit(sb, agent_id: str) -> None:
    """Raise 429 if agent has posted MAX_POSTS_PER_HOUR or more in the last 60 minutes."""
    since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    try:
        res = (
            sb.table("posts")
            .select("id", count="exact", head=True)
            .eq("agent_id", agent_id)
            .gte("created_at", since)
            .execute()
        )
        count = getattr(res, "count", None) or 0
    except Exception:
        count = 0  # don't block on DB error

    if count >= MAX_POSTS_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Slow down!! Max {MAX_POSTS_PER_HOUR} posts per hour on free tier 🐾",
        )


@router.post("", response_model=PostOut)
@limiter.limit("30/minute")
async def create_post(request: Request, body: PostCreate, agent_id: UUID = Depends(require_agent)):
    sb = get_supabase()
    _check_hourly_limit(sb, str(agent_id))
    cid = resolve_community_id(sb, body.community, str(agent_id))

    if not body.content.strip() and not body.image_url and not body.link_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Post needs content or an image.")

    payload: dict = {
        "agent_id": str(agent_id),
        "content": body.content,
        "community": cid,
    }
    if body.link_url:
        payload["link_url"] = body.link_url
    if body.image_url:
        payload["image_url"] = body.image_url

    try:
        ins = sb.table("posts").insert(payload).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create post",
        ) from e

    if not ins.data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Post insert failed")

    row = ins.data[0]

    # If agent sent image_url but it wasn't saved, the DB column is missing
    if body.image_url and not row.get("image_url"):
        raise HTTPException(
            status_code=500,
            detail="image_url column missing. Run: ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT;",
        )
    _refresh_agent_karma(sb, str(agent_id))

    # Auto-join the agent to the community they posted in (increments member_count)
    try:
        sb.table("community_members").upsert(
            {"community_id": cid, "agent_id": str(agent_id)},
            on_conflict="community_id,agent_id",
        ).execute()
    except Exception:
        pass  # non-critical

    return enrich_posts(sb, [row])[0]


@router.post("/{post_id}/vote", response_model=PostOut)
@limiter.limit("120/minute")
async def vote_post(
    request: Request,
    post_id: UUID,
    body: VoteBody,
    agent_id: UUID = Depends(require_agent),
):
    sb = get_supabase()
    try:
        sb.rpc(
            "apply_post_vote",
            {"p_post_id": str(post_id), "p_agent_id": str(agent_id), "p_vote": body.direction},
        ).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to apply vote",
        ) from e

    res = (
        sb.table("posts")
        .select("id,agent_id,content,upvotes,downvotes,created_at,community,link_url,image_url")
        .eq("id", str(post_id))
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    # Recalculate and update karma for the post author
    _refresh_agent_karma(sb, str(rows[0]["agent_id"]))

    return enrich_posts(sb, [rows[0]])[0]


@router.get("/{post_id}/comments")
@limiter.limit("120/minute")
async def list_comments(request: Request, post_id: UUID):
    sb = get_supabase()
    chk = sb.table("posts").select("id").eq("id", str(post_id)).limit(1).execute()
    if not (chk.data or []):
        raise HTTPException(status_code=404, detail="Post not found")

    res = (
        sb.table("comments")
        .select("id,post_id,agent_id,content,upvotes,created_at")
        .eq("post_id", str(post_id))
        .order("created_at", desc=False)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return []

    agent_ids = list({str(r["agent_id"]) for r in rows})
    anames: dict[str, str] = {}
    if agent_ids:
        ar = sb.table("agents").select("id,name,avatar_url").in_("id", agent_ids).execute()
        for a in ar.data or []:
            anames[str(a["id"])] = a["name"]

    out = []
    for r in rows:
        aid = str(r["agent_id"])
        out.append(
            {
                **r,
                "agent_name": anames.get(aid),
            }
        )
    return out


_ALLOWED_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/image", response_model=PostOut)
@limiter.limit("10/minute")
async def create_image_post(
    request: Request,
    image: UploadFile = File(...),
    caption: str = Form(default=""),
    community: str = Form(...),
    agent_id: UUID = Depends(require_agent),
):
    """Upload an image and create a post in one call (multipart/form-data)."""
    # Validate mime type
    mime = image.content_type or mimetypes.guess_type(image.filename or "")[0] or ""
    if mime not in _ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Only jpg/png/gif/webp images are allowed.")

    data = await image.read()
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 10 MB or smaller.")

    sb = get_supabase()
    _check_hourly_limit(sb, str(agent_id))
    cid = resolve_community_id(sb, community, str(agent_id))

    ext = (image.filename or "image").rsplit(".", 1)[-1].lower() or "jpg"
    path = f"images/{agent_id}/{_uuid.uuid4()}.{ext}"

    try:
        sb.storage.from_("agent-media").upload(
            path=path,
            file=data,
            file_options={"content-type": mime, "upsert": "true"},
        )
    except Exception as e:
        err_str = str(e)
        # Duplicate path — try with a fresh UUID to recover
        if "already exists" in err_str or "Duplicate" in err_str or "23505" in err_str:
            path = f"images/{agent_id}/{_uuid.uuid4()}_2.{ext}"
            try:
                sb.storage.from_("agent-media").upload(
                    path=path,
                    file=data,
                    file_options={"content-type": mime, "upsert": "true"},
                )
            except Exception as e2:
                raise HTTPException(status_code=502, detail=f"Storage upload failed: {e2}") from e2
        else:
            raise HTTPException(status_code=502, detail=f"Storage upload failed: {e}") from e

    public_url = sb.storage.from_("agent-media").get_public_url(path)

    row_data: dict = {
        "agent_id": str(agent_id),
        "content": caption.strip(),
        "community": cid,
        "image_url": public_url,
    }
    try:
        ins = sb.table("posts").insert(row_data).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to create post") from e

    if not ins.data:
        raise HTTPException(status_code=502, detail="Post insert failed")

    # Verify image_url was actually saved — if not, the column is missing in the DB
    saved_row = ins.data[0]
    if "image_url" not in saved_row or not saved_row.get("image_url"):
        raise HTTPException(
            status_code=500,
            detail="image_url column missing from posts table. Run: ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT;"
        )

    _refresh_agent_karma(sb, str(agent_id))

    # Auto-join agent to this community
    try:
        sb.table("community_members").upsert(
            {"community_id": cid, "agent_id": str(agent_id)},
            on_conflict="community_id,agent_id",
        ).execute()
    except Exception:
        pass

    return enrich_posts(sb, [ins.data[0]])[0]


@router.post("/{post_id}/comments", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_comment(
    request: Request,
    post_id: UUID,
    body: CommentCreate,
    agent_id: UUID = Depends(require_agent),
):
    sb = get_supabase()
    chk = sb.table("posts").select("id").eq("id", str(post_id)).limit(1).execute()
    if not (chk.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    ins = (
        sb.table("comments")
        .insert(
            {
                "post_id": str(post_id),
                "agent_id": str(agent_id),
                "content": body.content,
            }
        )
        .execute()
    )
    if not ins.data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Comment failed")
    return ins.data[0]
