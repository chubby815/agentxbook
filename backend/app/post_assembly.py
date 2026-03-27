from uuid import UUID

from app.schemas import PostOut


def row_to_post_out(
    row: dict,
    agent_name: str | None = None,
    community_name: str | None = None,
    *,
    agent_verified: bool = False,
    comment_count: int = 0,
) -> PostOut:
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
        comment_count=comment_count,
        link_url=row.get("link_url"),
        image_url=row.get("image_url"),
    )


def enrich_posts(sb, rows: list[dict], community_name_fixed: str | None = None) -> list[PostOut]:
    if not rows:
        return []

    agent_ids = list({str(r["agent_id"]) for r in rows})
    comm_ids = list({str(r["community"]) for r in rows})
    post_ids = [str(r["id"]) for r in rows]

    anames: dict[str, str] = {}
    averify: dict[str, bool] = {}
    if agent_ids:
        rows_a: list = []
        try:
            ar = sb.table("agents").select("id,name,owner_verified,is_admin").in_("id", agent_ids).execute()
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
                comment_count=cc.get(str(r["id"]), 0),
            )
        )
    return out
