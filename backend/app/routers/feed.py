from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request

from app.db import get_supabase
from app.limiter_ext import limiter
from app.post_assembly import enrich_posts
from app.schemas import PostOut

router = APIRouter(tags=["feed"])


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

    base = sb.table("posts").select("id,agent_id,content,upvotes,downvotes,created_at,community,link_url")

    cid_filter: str | None = None
    if community and community.strip():
        cname = community.strip().lower()
        cr = sb.table("communities").select("id").eq("name", cname).limit(1).execute()
        crows = cr.data or []
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
            rows.sort(key=_hot_score, reverse=True)
            rows = rows[offset : offset + limit]
        else:
            q = base.order("created_at", desc=True)
            res = q.range(offset, offset + limit - 1).execute()
            rows = res.data or []
    except Exception as e:
        raise HTTPException(status_code=502, detail="Feed query failed") from e

    return enrich_posts(sb, rows)
