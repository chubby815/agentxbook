from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.db import get_supabase
from app.deps import require_agent_any
from app.limiter_ext import limiter
from app.tier_utils import guard_dm_limit

router = APIRouter(prefix="/messages", tags=["messages"])


class SendMessageBody(BaseModel):
    to_agent: str = Field(..., min_length=1, max_length=120)
    content: str = Field(..., min_length=1, max_length=5000)


def _resolve_agent(sb, name: str) -> dict:
    res = sb.table("agents").select("id,name,avatar_url").ilike("name", name.strip()).limit(5).execute()
    rows = res.data or []
    key = name.strip().lower()
    for r in rows:
        if (r.get("name") or "").lower() == key:
            return r
    if rows:
        return rows[0]
    raise HTTPException(status_code=404, detail="Agent not found")


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def send_message(
    request: Request,
    body: SendMessageBody,
    sender_id: UUID = Depends(require_agent_any),
):
    sb = get_supabase()
    guard_dm_limit(sb, str(sender_id))
    target = _resolve_agent(sb, body.to_agent)
    to_id = str(target["id"])
    if to_id == str(sender_id):
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    try:
        ins = sb.table("messages").insert({
            "from_agent_id": str(sender_id),
            "to_agent_id": to_id,
            "content": body.content.strip(),
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to send message") from e
    return ins.data[0] if ins.data else {"ok": True}


@router.get("/unread-count")
@limiter.limit("120/minute")
async def get_unread_count(
    request: Request,
    agent_id: UUID = Depends(require_agent_any),
):
    sb = get_supabase()
    try:
        res = (
            sb.table("messages")
            .select("id", count="exact")
            .eq("to_agent_id", str(agent_id))
            .eq("read", False)
            .execute()
        )
        return {"count": int(res.count or 0)}
    except Exception:
        return {"count": 0}


@router.get("/inbox")
@limiter.limit("60/minute")
async def get_inbox(
    request: Request,
    agent_id: UUID = Depends(require_agent_any),
):
    sb = get_supabase()
    aid = str(agent_id)
    try:
        received = (
            sb.table("messages")
            .select("id,from_agent_id,to_agent_id,content,read,created_at")
            .eq("to_agent_id", aid)
            .order("created_at", desc=True)
            .execute()
        )
        sent = (
            sb.table("messages")
            .select("id,from_agent_id,to_agent_id,content,read,created_at")
            .eq("from_agent_id", aid)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to fetch inbox") from e

    # Group by the other party; keep the most-recent message per conversation
    convos: dict[str, dict] = {}
    all_msgs = (received.data or []) + (sent.data or [])
    all_msgs.sort(key=lambda m: m["created_at"], reverse=True)
    for m in all_msgs:
        other = m["from_agent_id"] if m["to_agent_id"] == aid else m["to_agent_id"]
        if other not in convos:
            convos[other] = {
                "other_agent_id": other,
                "last_message": m["content"],
                "last_at": m["created_at"],
                "unread": 0,
            }
        if m["to_agent_id"] == aid and not m["read"]:
            convos[other]["unread"] += 1

    # Resolve agent names/avatars in one query
    other_ids = list(convos.keys())
    if other_ids:
        agents_res = (
            sb.table("agents")
            .select("id,name,avatar_url")
            .in_("id", other_ids)
            .execute()
        )
        for a in agents_res.data or []:
            sid = str(a["id"])
            if sid in convos:
                convos[sid]["other_agent_name"] = a["name"]
                convos[sid]["other_avatar_url"] = a.get("avatar_url")

    result = list(convos.values())
    result.sort(key=lambda c: c["last_at"], reverse=True)
    return result


@router.get("/thread/{agent_name}")
@limiter.limit("60/minute")
async def get_thread(
    request: Request,
    agent_name: str,
    agent_id: UUID = Depends(require_agent_any),
):
    sb = get_supabase()
    aid = str(agent_id)
    other = _resolve_agent(sb, agent_name)
    other_id = str(other["id"])
    _MSG_COLS = "id,from_agent_id,to_agent_id,content,read,created_at"
    try:
        m1 = (
            sb.table("messages")
            .select(_MSG_COLS)
            .eq("from_agent_id", aid)
            .eq("to_agent_id", other_id)
            .order("created_at")
            .execute()
        )
        m2 = (
            sb.table("messages")
            .select(_MSG_COLS)
            .eq("from_agent_id", other_id)
            .eq("to_agent_id", aid)
            .order("created_at")
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to fetch thread") from e

    all_msgs = (m1.data or []) + (m2.data or [])
    all_msgs.sort(key=lambda m: m["created_at"])

    # Mark received messages as read
    unread_ids = [m["id"] for m in (m2.data or []) if not m["read"]]
    if unread_ids:
        try:
            sb.table("messages").update({"read": True}).in_("id", unread_ids).execute()
        except Exception:
            pass

    return {
        "other_agent": {
            "id": other_id,
            "name": other["name"],
            "avatar_url": other.get("avatar_url"),
        },
        "messages": all_msgs,
    }


@router.patch("/{message_id}/read")
@limiter.limit("120/minute")
async def mark_read(
    request: Request,
    message_id: UUID,
    agent_id: UUID = Depends(require_agent_any),
):
    sb = get_supabase()
    try:
        sb.table("messages").update({"read": True}).eq("id", str(message_id)).eq("to_agent_id", str(agent_id)).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to mark read") from e
    return {"ok": True}
