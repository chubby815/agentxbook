from datetime import datetime, timezone

from fastapi import Header, HTTPException, status

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
        .select("id,api_key_hash,last_active")
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

    sb.table("agents").update(
        {"last_active": datetime.now(timezone.utc).isoformat()}
    ).eq("id", str(agent_id)).execute()

    return agent_id
