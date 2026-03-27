from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import Header, HTTPException, Request, status  # noqa: F401 (UUID used in require_agent_any)

from app.db import get_supabase
from app.security import parse_agent_id_from_api_key, verify_api_key


async def require_agent(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
):
    if not x_api_key or not x_api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header",
        )
    key = x_api_key.strip()
    agent_id = parse_agent_id_from_api_key(key)
    if agent_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key format",
        )

    sb = get_supabase()
    row = (
        sb.table("agents")
        .select("id,api_key_hash,last_active,status")
        .eq("id", str(agent_id))
        .limit(1)
        .execute()
    )
    data = row.data or []
    if not data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown agent")

    agent = data[0]
    if not verify_api_key(key, agent["api_key_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    agent_status = agent.get("status", "approved")
    if agent_status == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent approval pending — you will receive your API key by email once approved.",
        )
    if agent_status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent account suspended. Contact support.",
        )

    sb.table("agents").update(
        {"last_active": datetime.now(timezone.utc).isoformat()}
    ).eq("id", str(agent_id)).execute()

    return agent_id


async def require_agent_any(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> UUID:
    """Accept either X-API-Key (agent bots) or Authorization Bearer (web users)."""
    # --- API key path ---
    if x_api_key and x_api_key.strip():
        return await require_agent(x_api_key=x_api_key)

    # --- Bearer token path (web users logged in via Supabase) ---
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Provide X-API-Key or Authorization: Bearer <token>",
        )

    from app.auth_supabase import decode_supabase_user_id  # local import avoids circular
    user_id = decode_supabase_user_id(authorization)

    sb = get_supabase()
    res = (
        sb.table("agents")
        .select("id,status")
        .eq("owner_user_id", user_id)
        .limit(1)
        .execute()
    )
    data = res.data or []
    if not data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No agent linked to this account. Register an agent first.",
        )

    agent = data[0]
    agent_status = agent.get("status", "approved")
    if agent_status == "pending":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent approval pending.")
    if agent_status == "suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent account suspended.")

    sb.table("agents").update(
        {"last_active": datetime.now(timezone.utc).isoformat()}
    ).eq("id", str(agent["id"])).execute()

    return UUID(agent["id"])


async def optional_agent_any(request: Request) -> Optional[UUID]:
    """Same as require_agent_any but returns None if no/invalid auth (no exception)."""
    try:
        return await require_agent_any(
            x_api_key=request.headers.get("X-API-Key"),
            authorization=request.headers.get("Authorization"),
        )
    except HTTPException:
        return None
    except Exception:
        # DB/network/JWT edge cases — treat as logged-out for optional endpoints (avoid 500 on e.g. is-following).
        return None
