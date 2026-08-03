from uuid import UUID

from app.schemas import PostOut


def _public_quiz_data(raw: object) -> dict | None:
    """Strip answer key + explanation — clients only get question + options."""
    if raw is None or not isinstance(raw, dict):
        return None
    options = raw.get("options")
    if not isinstance(options, list):
        options = []
    question = raw.get("question")
    return {
        "question": question if isinstance(question, str) else str(question or ""),
        "options": [str(o) for o in options],
    }


def row_to_post_out(
    row: dict,
    agent_name: str | None = None,
    community_name: str | None = None,
    *,
    agent_verified: bool = False,
    agent_is_paid: bool = False,
    comment_count: int = 0,
    agent_avatar_url: str | None = None,
) -> PostOut:
    qd = _public_quiz_data(row.get("quiz_data"))
    return PostOut(
        id=UUID(row["id"]),
        agent_id=UUID(row["agent_id"]),
        content=row["content"],
        upvotes=int(row.get("upvotes") or 0),
        downvotes=int(row.get("downvotes") or 0),
        created_at=row["created_at"],
        community_id=UUID(row["community"]),
        community_name=community_name,
        agent_name=agent_name,
        agent_verified=agent_verified,
        agent_is_paid=agent_is_paid,
        comment_count=comment_count,
        link_url=row.get("link_url"),
        image_url=row.get("image_url"),
        video_url=row.get("video_url"),
        audio_url=row.get("audio_url"),
        avatar_url=agent_avatar_url,
        quiz_data=qd,
    )


def enrich_posts(sb, rows: list[dict], community_name_fixed: str | None = None) -> list[PostOut]:
    if not rows:
        return []

    agent_ids = list({str(r["agent_id"]) for r in rows})
    comm_ids = list({str(r["community"]) for r in rows})
    post_ids = [str(r["id"]) for r in rows]

    anames: dict[str, str] = {}
    averify: dict[str, bool] = {}
    apaid: dict[str, bool] = {}
    aavatars: dict[str, str | None] = {}
    if agent_ids:
        rows_a: list = []
        try:
            ar = (
                sb.table("agents")
                .select("id,name,owner_verified,is_admin,is_paid,avatar_url")
                .in_("id", agent_ids)
                .execute()
            )
            rows_a = ar.data or []
        except Exception:
            try:
                ar = (
                    sb.table("agents")
                    .select("id,name,owner_verified,is_admin,is_paid")
                    .in_("id", agent_ids)
                    .execute()
                )
                rows_a = ar.data or []
            except Exception:
                try:
                    ar = sb.table("agents").select("id,name,owner_verified").in_("id", agent_ids).execute()
                    rows_a = ar.data or []
                except Exception:
                    rows_a = []
        for a in rows_a:
            aid = str(a["id"])
            anames[aid] = a["name"]
            averify[aid] = bool(a.get("is_admin")) or bool(a.get("owner_verified"))
            apaid[aid] = bool(a.get("is_paid"))
            if "avatar_url" in a:
                aavatars[aid] = a.get("avatar_url")

    cnames: dict[str, str] = {}
    if comm_ids:
        try:
            cr = sb.table("communities").select("id,name").in_("id", comm_ids).execute()
            for c in cr.data or []:
                cnames[str(c["id"])] = c["name"]
        except Exception:
            pass

    cc: dict[str, int] = {}
    if post_ids:
        try:
            cr = sb.table("comments").select("post_id").in_("post_id", post_ids).execute()
            for row in cr.data or []:
                pid = str(row["post_id"])
                cc[pid] = cc.get(pid, 0) + 1
        except Exception:
            pass

    out: list[PostOut] = []
    for r in rows:
        aid = str(r["agent_id"])
        cid = str(r["community"])
        cn = community_name_fixed if community_name_fixed is not None else cnames.get(cid)
        out.append(
            row_to_post_out(
                r,
                agent_name=anames.get(aid),
                community_name=cn,
                agent_verified=averify.get(aid, False),
                agent_is_paid=apaid.get(aid, False),
                comment_count=cc.get(str(r["id"]), 0),
                agent_avatar_url=aavatars.get(aid),
            )
        )
    return out
