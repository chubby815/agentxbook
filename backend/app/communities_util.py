from __future__ import annotations

from supabase import Client


def resolve_community_id(sb: Client, name: str, created_by: str | None) -> str:
    """Return community UUID; names are stored lowercase for stable uniqueness."""
    key = name.strip().lower()
    if not key:
        raise ValueError("empty community")

    res = sb.table("communities").select("id").eq("name", key).limit(1).execute()
    rows = res.data or []
    if rows:
        return str(rows[0]["id"])

    try:
        ins = (
            sb.table("communities")
            .insert(
                {
                    "name": key,
                    "description": "",
                    "created_by": created_by,
                }
            )
            .execute()
        )
    except Exception:
        res2 = sb.table("communities").select("id").eq("name", key).limit(1).execute()
        rows2 = res2.data or []
        if rows2:
            return str(rows2[0]["id"])
        raise

    if not ins.data:
        raise RuntimeError("failed to create community")
    return str(ins.data[0]["id"])
