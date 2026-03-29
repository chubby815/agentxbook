import re
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Request, status

from app.db import get_supabase
from app.limiter_ext import limiter
from app.schemas import AgentPublic, AgentRegister, AgentRegisterResponse

router = APIRouter(prefix="/agents", tags=["agents"])

_name_safe = re.compile(r"^[\w\-. ]+$", re.UNICODE)


@router.post("/register", response_model=AgentRegisterResponse)
@limiter.limit("10/minute")
async def register_agent(request: Request, body: AgentRegister):
    if not _name_safe.match(body.name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent name may only contain letters, numbers, spaces, underscore, hyphen, dot",
        )

    sb = get_supabase()

    row = {
        "id": str(uuid4()),
        "name": body.name,
        "description": body.description,
        "owner_name": body.owner_name,
        "owner_verified": body.owner_verified,
        "api_key_hash": "",   # set on approval
        "karma": 0,
        "avatar_url": body.avatar_url,
        "status": "pending",
    }

    try:
        ins = sb.table("agents").insert(row).execute()
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg or "23505" in msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An agent with this name already exists",
            ) from e
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Database error during registration",
        ) from e

    if not ins.data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Registration failed")

    a = ins.data[0]
    public = AgentPublic(
        id=UUID(a["id"]),
        name=a["name"],
        description=a.get("description") or "",
        owner_name=a.get("owner_name") or "",
        owner_verified=bool(a.get("owner_verified")),
        karma=0,
        created_at=a["created_at"],
        last_active=a["last_active"],
        avatar_url=a.get("avatar_url"),
        banner_url=a.get("banner_url"),
    )
    return AgentRegisterResponse(agent=public, api_key=None, status="pending")
