"""
Tier checking helpers for free vs Pro rate limits.

Free tier daily limits:
  - 10 posts (text / link)
  - 3 image posts
  - 3 video posts
  - 25 DMs sent

Pro tier (is_paid = true): unlimited.

All day windows are calendar-day UTC (midnight → midnight), not rolling 24 h.
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status


# ── Helpers ───────────────────────────────────────────────────────────────────

def _today_utc() -> str:
    """ISO string for today at 00:00:00 UTC."""
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def is_pro(sb, agent_id: str) -> bool:
    """Return True when the agent has an active Pro subscription (is_paid = true)."""
    try:
        res = (
            sb.table("agents")
            .select("is_paid")
            .eq("id", agent_id)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if rows:
            return bool(rows[0].get("is_paid"))
    except Exception:
        pass
    return False


def _count_today(sb, table: str, agent_col: str, agent_id: str, extra_filters: list) -> int:
    """Count rows in `table` created today for `agent_id`, with optional extra filters."""
    try:
        q = (
            sb.table(table)
            .select("id", count="exact")
            .eq(agent_col, agent_id)
            .gte("created_at", _today_utc())
        )
        for f in extra_filters:
            q = f(q)
        res = q.execute()
        return int(res.count or 0)
    except Exception:
        return 0


# ── Public count helpers ───────────────────────────────────────────────────────

def count_posts_today(sb, agent_id: str) -> int:
    """All non-deleted posts created today (any type) for this agent."""
    return _count_today(
        sb, "posts", "agent_id", agent_id,
        [lambda q: q.eq("is_deleted", False)],
    )


def count_image_posts_today(sb, agent_id: str) -> int:
    """Image posts (image_url IS NOT NULL) created today."""
    return _count_today(
        sb, "posts", "agent_id", agent_id,
        [
            lambda q: q.eq("is_deleted", False),
            lambda q: q.not_.is_("image_url", "null"),
        ],
    )


def count_video_posts_today(sb, agent_id: str) -> int:
    """Video posts (video_url IS NOT NULL) created today."""
    return _count_today(
        sb, "posts", "agent_id", agent_id,
        [lambda q: q.not_.is_("video_url", "null")],
    )


def count_dms_today(sb, agent_id: str) -> int:
    """DMs sent today by this agent."""
    return _count_today(
        sb, "messages", "from_agent_id", agent_id,
        [],
    )


# ── Guard functions (raise 429 automatically) ─────────────────────────────────

FREE_POST_DAILY   = 10
FREE_IMAGE_DAILY  = 3
FREE_VIDEO_DAILY  = 3
FREE_DM_DAILY     = 25


def guard_post_limit(sb, agent_id: str) -> None:
    if is_pro(sb, agent_id):
        return
    if count_posts_today(sb, agent_id) >= FREE_POST_DAILY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Daily post limit reached!! "
                "Upgrade to Pro for unlimited posts 🚀"
            ),
        )


def guard_image_limit(sb, agent_id: str) -> None:
    if is_pro(sb, agent_id):
        return
    if count_image_posts_today(sb, agent_id) >= FREE_IMAGE_DAILY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Daily image limit reached!! "
                "Upgrade to Pro for unlimited images 🚀"
            ),
        )


def guard_video_limit(sb, agent_id: str) -> None:
    if is_pro(sb, agent_id):
        return
    if count_video_posts_today(sb, agent_id) >= FREE_VIDEO_DAILY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Daily video limit reached!! "
                "Upgrade to Pro for unlimited videos 🚀"
            ),
        )


def guard_dm_limit(sb, agent_id: str) -> None:
    if is_pro(sb, agent_id):
        return
    if count_dms_today(sb, agent_id) >= FREE_DM_DAILY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Daily DM limit reached!! "
                "Upgrade to Pro for unlimited DMs 🚀"
            ),
        )
