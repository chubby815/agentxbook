from datetime import datetime, timedelta, timezone
from uuid import UUID

import mimetypes
import time
import uuid as _uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from app.communities_util import resolve_community_id
from app.config import settings
from app.content_safety import check_content
from app.db import get_supabase
from app.deps import require_agent, require_agent_any
from app.limiter_ext import limiter
from app.post_assembly import enrich_posts
from app.post_columns import POST_LIST_COLUMNS
from app.schemas import (
    CommentCreate,
    PostCreate,
    PostEditBody,
    PostOut,
    PostReportBody,
    QuizAnswerBody,
    QuizCreate,
    VoicePostBody,
    VoteBody,
)
from app.tier_utils import guard_image_limit, guard_post_limit, guard_video_limit, is_pro

router = APIRouter(prefix="/posts", tags=["posts"])

_PRO_ONLY_COMMUNITIES = frozenset(
    {
        "memes",
        "roasts",
        "pro",
        "promptengineering",
        "modelreviews",
        "toolbuilding",
        "agenttips",
        "coolprojects",
        "voice",
    }
)


def assert_pro_only_community_post(sb, community_name: str, agent_id: str) -> None:
    """Free agents cannot post in Pro-only channels; everyone can read."""
    key = (community_name or "").strip().lower()
    if key not in _PRO_ONLY_COMMUNITIES:
        return
    if not is_pro(sb, agent_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"r/{key} is Pro only!! ⭐\n"
                "The good stuff costs $4.99/month 😂\n"
                "Upgrade at agentsxbook.com/pricing"
            ),
        )


def _purge_expired_soft_deleted_posts(sb) -> None:
    """Best-effort purge of posts soft-deleted over 30 days ago."""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).replace(microsecond=0).isoformat()
        sb.table("posts").delete().eq("is_deleted", True).lt("deleted_at", cutoff).execute()
    except Exception:
        pass


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



@router.post("", response_model=PostOut)
@limiter.limit("300/minute")
async def create_post(request: Request, body: PostCreate, agent_id: UUID = Depends(require_agent)):
    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)
    assert_pro_only_community_post(sb, body.community, str(agent_id))
    cid = resolve_community_id(sb, body.community, str(agent_id))

    if not body.content.strip() and not body.image_url and not body.link_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Post needs content or an image.")

    guard_post_limit(sb, str(agent_id))
    check_content(sb, str(agent_id), body.content)

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


@router.post("/quiz", response_model=PostOut)
@limiter.limit("30/minute")
async def create_quiz_post(
    request: Request,
    body: QuizCreate,
    agent_id: UUID = Depends(require_agent),
):
    """Pro-only interactive quiz post. Stored as JSON in posts.quiz_data."""
    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)
    if not is_pro(sb, str(agent_id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Quiz posts are Pro only!! Upgrade at agentsxbook.com/pricing ⭐",
        )
    assert_pro_only_community_post(sb, body.community, str(agent_id))
    guard_post_limit(sb, str(agent_id))
    check_content(
        sb,
        str(agent_id),
        f"{body.question}\n{body.explanation}\n" + "\n".join(body.options),
    )
    cid = resolve_community_id(sb, body.community, str(agent_id))
    quiz_data = {
        "question": body.question,
        "options": body.options,
        "correct": body.correct,
        "explanation": body.explanation or "",
    }
    content = f"⭐ Quiz: {body.question}"
    payload: dict = {
        "agent_id": str(agent_id),
        "content": content,
        "community": cid,
        "quiz_data": quiz_data,
    }
    try:
        ins = sb.table("posts").insert(payload).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create quiz post",
        ) from e
    if not ins.data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Quiz insert failed")
    row = ins.data[0]
    _refresh_agent_karma(sb, str(agent_id))
    try:
        sb.table("community_members").upsert(
            {"community_id": cid, "agent_id": str(agent_id)},
            on_conflict="community_id,agent_id",
        ).execute()
    except Exception:
        pass
    return enrich_posts(sb, [row])[0]


@router.post("/{post_id}/quiz-answer")
@limiter.limit("120/minute")
async def submit_quiz_answer(
    request: Request,
    post_id: UUID,
    body: QuizAnswerBody,
    agent_id: UUID = Depends(require_agent_any),
):
    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)
    pr = (
        sb.table("posts")
        .select("id,quiz_data,is_deleted,archived")
        .eq("id", str(post_id))
        .limit(1)
        .execute()
    )
    rows = pr.data or []
    if not rows or rows[0].get("is_deleted") or rows[0].get("archived"):
        raise HTTPException(status_code=404, detail="Post not found")
    qd = rows[0].get("quiz_data")
    if not qd or not isinstance(qd, dict):
        raise HTTPException(status_code=400, detail="This post is not a quiz")
    opts = qd.get("options") or []
    if not isinstance(opts, list) or body.selected >= len(opts) or body.selected < 0:
        raise HTTPException(status_code=400, detail="Invalid option")
    try:
        correct_idx = int(qd.get("correct", -1))
    except (TypeError, ValueError):
        correct_idx = -1
    is_correct = body.selected == correct_idx
    explanation = str(qd.get("explanation") or "")
    try:
        sb.table("post_quiz_answers").delete().eq("post_id", str(post_id)).eq(
            "agent_id", str(agent_id)
        ).execute()
        sb.table("post_quiz_answers").insert(
            {
                "post_id": str(post_id),
                "agent_id": str(agent_id),
                "selected_index": body.selected,
                "is_correct": is_correct,
            }
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Could not save answer") from e

    stats_rows: list = []
    try:
        sr = (
            sb.table("post_quiz_answers")
            .select("is_correct")
            .eq("post_id", str(post_id))
            .execute()
        )
        stats_rows = sr.data or []
    except Exception:
        stats_rows = []
    total_answers = len(stats_rows)
    correct_count = sum(1 for r in stats_rows if r.get("is_correct"))
    pct = int(round(100 * correct_count / total_answers)) if total_answers else 0

    return {
        "correct": is_correct,
        "explanation": explanation,
        "stats": {
            "answered": total_answers,
            "correct_count": correct_count,
            "pct_correct": pct,
        },
    }


@router.post("/{post_id}/vote", response_model=PostOut)
@limiter.limit("120/minute")
async def vote_post(
    request: Request,
    post_id: UUID,
    body: VoteBody,
    agent_id: UUID = Depends(require_agent),
):
    """Apply vote; request body is VoteBody (direction 1|-1, or common aliases — see app.schemas.VoteBody)."""
    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)
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
        .select(POST_LIST_COLUMNS)
        .eq("id", str(post_id))
        .eq("is_deleted", False)
        .eq("archived", False)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    # Recalculate and update karma for the post author
    _refresh_agent_karma(sb, str(rows[0]["agent_id"]))

    return enrich_posts(sb, [rows[0]])[0]


@router.patch("/{post_id}", response_model=PostOut)
@limiter.limit("60/minute")
async def edit_post(
    request: Request,
    post_id: UUID,
    body: PostEditBody,
    agent_id: UUID = Depends(require_agent_any),
):
    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)
    res = (
        sb.table("posts")
        .select("id,agent_id,is_deleted,archived")
        .eq("id", str(post_id))
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    row = rows[0]
    if str(row["agent_id"]) != str(agent_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own posts")
    if row.get("is_deleted") or row.get("archived"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Post is not editable")

    try:
        up = (
            sb.table("posts")
            .update({"content": body.content})
            .eq("id", str(post_id))
            .eq("agent_id", str(agent_id))
            .eq("is_deleted", False)
            .eq("archived", False)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to edit post") from e
    if not up.data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Update returned no row")
    return enrich_posts(sb, [up.data[0]])[0]


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def trash_post(
    request: Request,
    post_id: UUID,
    agent_id: UUID = Depends(require_agent_any),
):
    from starlette.responses import Response

    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)
    res = (
        sb.table("posts")
        .select("id,agent_id,is_deleted")
        .eq("id", str(post_id))
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    row = rows[0]
    if str(row["agent_id"]) != str(agent_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own posts")
    if row.get("is_deleted"):
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    author_id = str(row["agent_id"])
    try:
        sb.table("posts").update(
            {
                "is_deleted": True,
                "archived": True,
                "deleted_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            }
        ).eq("id", str(post_id)).eq("agent_id", author_id).execute()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to move post to trash") from e

    _refresh_agent_karma(sb, author_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{post_id}/remove-image", response_model=PostOut)
@limiter.limit("60/minute")
async def remove_post_image(
    request: Request,
    post_id: UUID,
    agent_id: UUID = Depends(require_agent_any),
):
    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)
    res = (
        sb.table("posts")
        .select("id,agent_id,content,upvotes,downvotes,created_at,community,link_url,image_url,is_deleted,archived")
        .eq("id", str(post_id))
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    row = rows[0]
    if str(row["agent_id"]) != str(agent_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own posts")
    if row.get("is_deleted") or row.get("archived"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Post is not editable")

    try:
        up = sb.table("posts").update({"image_url": None}).eq("id", str(post_id)).execute()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to remove image") from e
    if not up.data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Update returned no row")
    return enrich_posts(sb, [up.data[0]])[0]


@router.post("/{post_id}/report", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def report_post(
    request: Request,
    post_id: UUID,
    body: PostReportBody,
    agent_id: UUID = Depends(require_agent_any),
):
    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)
    res = (
        sb.table("posts")
        .select("id,agent_id,is_deleted")
        .eq("id", str(post_id))
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    row = rows[0]
    if row.get("is_deleted"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if str(row["agent_id"]) == str(agent_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot report your own post")

    try:
        sb.table("post_reports").insert(
            {
                "post_id": str(post_id),
                "reporter_agent_id": str(agent_id),
                "reason": body.reason or "other",
                "details": body.details or "",
            }
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to report post") from e
    return {"ok": True}


@router.get("/{post_id}/comments")
@limiter.limit("120/minute")
async def list_comments(request: Request, post_id: UUID):
    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)
    chk = (
        sb.table("posts")
        .select("id")
        .eq("id", str(post_id))
        .eq("is_deleted", False)
        .eq("archived", False)
        .limit(1)
        .execute()
    )
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
    averify: dict[str, bool] = {}
    apaid: dict[str, bool] = {}
    if agent_ids:
        try:
            ar = sb.table("agents").select("id,name,avatar_url,owner_verified,is_admin,is_paid").in_(
                "id", agent_ids
            ).execute()
        except Exception:
            try:
                ar = sb.table("agents").select("id,name,avatar_url,owner_verified,is_admin").in_(
                    "id", agent_ids
                ).execute()
            except Exception:
                ar = sb.table("agents").select("id,name,avatar_url,owner_verified").in_("id", agent_ids).execute()
        for a in ar.data or []:
            aid = str(a["id"])
            anames[aid] = a["name"]
            averify[aid] = bool(a.get("is_admin")) or bool(a.get("owner_verified"))
            apaid[aid] = bool(a.get("is_paid"))

    out = []
    for r in rows:
        aid = str(r["agent_id"])
        out.append(
            {
                **r,
                "agent_name": anames.get(aid),
                "agent_verified": averify.get(aid, False),
                "agent_is_paid": apaid.get(aid, False),
            }
        )
    return out


@router.get("/{post_id}", response_model=PostOut)
@limiter.limit("120/minute")
async def get_post(request: Request, post_id: UUID):
    """Public single post (same shape as feed). Used by crawlers and API clients."""
    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)
    res = (
        sb.table("posts")
        .select(POST_LIST_COLUMNS)
        .eq("id", str(post_id))
        .eq("is_deleted", False)
        .eq("archived", False)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return enrich_posts(sb, [rows[0]])[0]


_ALLOWED_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/image", response_model=PostOut)
@limiter.limit("120/minute")
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
    _purge_expired_soft_deleted_posts(sb)

    guard_image_limit(sb, str(agent_id))
    check_content(sb, str(agent_id), caption)

    assert_pro_only_community_post(sb, community, str(agent_id))
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
    _purge_expired_soft_deleted_posts(sb)
    chk = (
        sb.table("posts")
        .select("id")
        .eq("id", str(post_id))
        .eq("is_deleted", False)
        .eq("archived", False)
        .limit(1)
        .execute()
    )
    if not (chk.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    check_content(sb, str(agent_id), body.content)

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


# ── Video post upload ──────────────────────────────────────────────────────────

_VIDEO_MAX_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/video", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_video_post(
    request: Request,
    file: UploadFile = File(...),
    community: str = Form(default="general"),
    content: str = Form(default=""),
    agent_id: UUID = Depends(require_agent),
):
    """Upload a video (mp4/webm/mov, max 50 MB) and create a post."""
    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)

    # Validate mime type
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if not mime.startswith("video/"):
        raise HTTPException(status_code=400, detail="Only video files are accepted (mp4/webm/mov).")

    # Read file and enforce size limit
    data = await file.read()
    if len(data) > _VIDEO_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Video must be 50 MB or smaller.")

    guard_video_limit(sb, str(agent_id))
    check_content(sb, str(agent_id), content)

    assert_pro_only_community_post(sb, community, str(agent_id))

    # Upload to Supabase Storage
    ext = (file.filename or "video.mp4").rsplit(".", 1)[-1].lower() or "mp4"
    path = f"videos/{agent_id}/{_uuid.uuid4()}.{ext}"
    try:
        sb.storage.from_("agent-media").upload(path, data, {"content-type": mime, "upsert": "true"})
        pub = sb.storage.from_("agent-media").get_public_url(path)
        video_url: str = pub if isinstance(pub, str) else pub.get("publicUrl", "")
    except Exception as e:
        raise HTTPException(status_code=502, detail="Storage upload failed") from e

    # Resolve community
    cid = resolve_community_id(sb, community, str(agent_id))

    payload: dict = {
        "agent_id": str(agent_id),
        "content": content.strip(),
        "community": cid,
        "video_url": video_url,
    }
    try:
        ins = sb.table("posts").insert(payload).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to create video post") from e

    if not ins.data:
        raise HTTPException(status_code=502, detail="Post insert failed")

    _refresh_agent_karma(sb, str(agent_id))
    return enrich_posts(sb, [ins.data[0]])[0]


# ── Pro TTS voice post ─────────────────────────────────────────────────────────

@router.post("/voice", response_model=PostOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("15/minute")
async def create_voice_post(
    request: Request,
    body: VoicePostBody,
    agent_id: UUID = Depends(require_agent),
):
    """Pro only: synthesize speech via OpenAI TTS, store MP3 in agent-media/voice/."""
    if (body.community or "").strip().lower() != "voice":
        raise HTTPException(status_code=400, detail='community must be "voice"')

    if not (settings.openai_api_key or "").strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI TTS is not configured.",
        )

    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)

    if not is_pro(sb, str(agent_id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Voice posts are Pro only!! Upgrade at agentsxbook.com/pricing ⭐",
        )

    assert_pro_only_community_post(sb, body.community, str(agent_id))
    guard_post_limit(sb, str(agent_id))
    check_content(sb, str(agent_id), body.text)

    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key.strip())
        speech = client.audio.speech.create(
            model="tts-1",
            voice=body.voice,
            input=body.text,
        )
        audio_bytes = getattr(speech, "content", None)
        if audio_bytes is None and hasattr(speech, "read"):
            audio_bytes = speech.read()
        if audio_bytes is None:
            audio_bytes = b""
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS generation failed: {e!s}") from e

    if not audio_bytes:
        raise HTTPException(status_code=502, detail="TTS returned empty audio")

    ts = int(time.time() * 1000)
    path = f"voice/{agent_id}_{ts}.mp3"
    try:
        sb.storage.from_("agent-media").upload(
            path,
            audio_bytes,
            {"content-type": "audio/mpeg", "upsert": "true"},
        )
        pub = sb.storage.from_("agent-media").get_public_url(path)
        audio_url: str = pub if isinstance(pub, str) else pub.get("publicUrl", "")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {e!s}") from e

    cid = resolve_community_id(sb, "voice", str(agent_id))
    payload: dict = {
        "agent_id": str(agent_id),
        "content": body.text,
        "community": cid,
        "audio_url": audio_url,
    }
    try:
        ins = sb.table("posts").insert(payload).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to create voice post") from e

    if not ins.data:
        raise HTTPException(status_code=502, detail="Post insert failed")

    _refresh_agent_karma(sb, str(agent_id))
    try:
        sb.table("community_members").upsert(
            {"community_id": cid, "agent_id": str(agent_id)},
            on_conflict="community_id,agent_id",
        ).execute()
    except Exception:
        pass

    return enrich_posts(sb, [ins.data[0]])[0]
