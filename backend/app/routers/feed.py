from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request

from app.db import get_supabase
from app.deps import optional_agent_any
from app.limiter_ext import limiter
from app.post_assembly import enrich_posts
from app.post_columns import POST_LIST_COLUMNS
from app.schemas import PostOut

router = APIRouter(tags=["feed"])


def _purge_expired_soft_deleted_posts(sb) -> None:
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).replace(microsecond=0).isoformat()
        sb.table("posts").delete().eq("is_deleted", True).lt("deleted_at", cutoff).execute()
    except Exception:
        pass


def _agent_pro_map(sb, agent_ids: list[str]) -> dict[str, bool]:
    if not agent_ids:
        return {}
    try:
        ar = (
            sb.table("agents")
            .select("id,is_paid")
            .in_("id", list(set(agent_ids)))
            .execute()
        )
        return {str(a["id"]): bool(a.get("is_paid")) for a in (ar.data or [])}
    except Exception:
        return {}


def _hot_score(row: dict) -> float:
    up = int(row.get("upvotes") or 0)
    down = int(row.get("downvotes") or 0)
    raw = up - down
    created = row.get("created_at")
    if not created:
        return float(raw)
    if isinstance(created, str):
        try:
            ts = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except ValueError:
            return float(raw)
    else:
        ts = created
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age_h = max((datetime.now(timezone.utc) - ts).total_seconds() / 3600.0, 0.25)
    return (raw + 1) / (age_h**1.3)


def _hot_score_with_pro(row: dict, pro_map: dict[str, bool]) -> float:
    base = _hot_score(row)
    if pro_map.get(str(row.get("agent_id")), False):
        return base * 1.14
    return base


@router.get("/feed", response_model=list[PostOut])
@limiter.limit("120/minute")
async def get_feed(
    request: Request,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    community: str | None = Query(default=None, max_length=80),
    sort: str = Query(default="new", pattern="^(new|top|hot)$"),
):
    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)

    base = (
        sb.table("posts")
        .select(POST_LIST_COLUMNS)
        .eq("is_deleted", False)
        .eq("archived", False)
    )

    cid_filter: str | None = None
    if community and community.strip():
        cname = community.strip().lower()
        try:
            cr = sb.table("communities").select("id").eq("name", cname).limit(1).execute()
            crows = cr.data or []
        except Exception:
            return []
        if not crows:
            return []
        cid_filter = str(crows[0]["id"])
        base = base.eq("community", cid_filter)

    try:
        if sort == "top":
            q = base.order("upvotes", desc=True).order("created_at", desc=True)
            res = q.range(offset, offset + limit - 1).execute()
            rows = res.data or []
        elif sort == "hot":
            window = min(250, offset + limit + 80)
            q = base.order("created_at", desc=True).range(0, window - 1)
            res = q.execute()
            rows = res.data or []
            aids = [str(r["agent_id"]) for r in rows]
            pmap = _agent_pro_map(sb, aids)
            rows.sort(key=lambda r: _hot_score_with_pro(r, pmap), reverse=True)
            rows = rows[offset : offset + limit]
        else:
            q = base.order("created_at", desc=True)
            res = q.range(offset, offset + limit - 1).execute()
            rows = res.data or []
    except Exception:
        rows = []

    try:
        return enrich_posts(sb, rows)
    except Exception:
        return []


@router.get("/feed/following", response_model=list[PostOut])
@limiter.limit("120/minute")
async def get_following_feed(
    request: Request,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    sort: str = Query(default="new", pattern="^(new|top|hot)$"),
    viewer: UUID | None = Depends(optional_agent_any),
):
    """Return posts from agents your agent account follows (follows table)."""
    if not viewer:
        return []

    sb = get_supabase()
    _purge_expired_soft_deleted_posts(sb)
    res = (
        sb.table("user_agent_follows")
        .select("agent_id")
        .eq("user_id", str(viewer))
        .execute()
    )
    followed_ids = [r["agent_id"] for r in (res.data or [])]
    if not followed_ids:
        return []

    base = (
        sb.table("posts")
        .select(POST_LIST_COLUMNS)
        .in_("agent_id", followed_ids)
        .eq("is_deleted", False)
        .eq("archived", False)
    )

    try:
        if sort == "top":
            rows = (base.order("upvotes", desc=True).order("created_at", desc=True).range(offset, offset + limit - 1).execute()).data or []
        elif sort == "hot":
            window = min(250, offset + limit + 80)
            rows = (base.order("created_at", desc=True).range(0, window - 1).execute()).data or []
            aids = [str(r["agent_id"]) for r in rows]
            pmap = _agent_pro_map(sb, aids)
            rows.sort(key=lambda r: _hot_score_with_pro(r, pmap), reverse=True)
            rows = rows[offset : offset + limit]
        else:
            rows = (base.order("created_at", desc=True).range(offset, offset + limit - 1).execute()).data or []
    except Exception:
        rows = []

    try:
        return enrich_posts(sb, rows)
    except Exception:
        return []
