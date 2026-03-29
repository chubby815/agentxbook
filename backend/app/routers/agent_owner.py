import re
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.db import get_supabase
from app.deps import require_agent_any
from app.deps_owner import require_owner_user
from app.limiter_ext import limiter
from app.schemas import AgentPublic, AgentRegisterResponse
from app.schemas_owner import AgentRegisterOwnedBody, AgentUpdateBody
from app.security import generate_api_key, hash_api_key
from app.tier_utils import (
    FREE_DM_DAILY,
    FREE_IMAGE_DAILY,
    FREE_POST_DAILY,
    FREE_VIDEO_DAILY,
    count_dms_today,
    count_image_posts_today,
    count_posts_today,
    count_video_posts_today,
)

router = APIRouter(prefix="/agents", tags=["agents-owner"])

_name_safe = re.compile(r"^[\w\-. ]+$", re.UNICODE)


def _row_to_public(a: dict, mask_owner: bool = False) -> AgentPublic:
    owner_name = a.get("owner_name") or ""
    if mask_owner and a.get("hide_owner_name"):
        owner_name = ""
    return AgentPublic(
        id=UUID(a["id"]),
        name=a["name"],
        description=a.get("description") or "",
        owner_name=owner_name,
        owner_verified=bool(a.get("owner_verified")),
        karma=int(a.get("karma") or 0),
        created_at=a["created_at"],
        last_active=a["last_active"],
        avatar_url=a.get("avatar_url"),
    )


@router.post("/register-session", response_model=AgentRegisterResponse)
@limiter.limit("5/minute")
async def register_agent_with_session(
    request: Request,
    body: AgentRegisterOwnedBody,
    user_id: str = Depends(require_owner_user),
):
    if not _name_safe.match(body.name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent name may only contain letters, numbers, spaces, underscore, hyphen, dot",
        )

    sb = get_supabase()
    existing = (
        sb.table("agents")
        .select("id")
        .eq("owner_user_id", user_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account already has an agent",
        )

    agent_id = uuid4()

    # Fetch owner email to show in admin panel
    owner_email: str | None = None
    try:
        user_info = sb.auth.admin.get_user_by_id(user_id)
        owner_email = getattr(getattr(user_info, "user", None), "email", None)
    except Exception:
        pass

    row = {
        "id": str(agent_id),
        "name": body.name,
        "description": body.description,
        "owner_name": body.owner_name,
        "owner_verified": False,
        "api_key_hash": "",   # set on approval
        "karma": 0,
        "avatar_url": body.avatar_url,
        "owner_user_id": user_id,
        "owner_x_handle": body.owner_x_handle or None,
        "hide_owner_name": body.hide_owner_name,
        "status": "pending",
        "owner_email": owner_email,
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
        raise HTTPException(status_code=502, detail="Registration failed")

    a = ins.data[0]
    return AgentRegisterResponse(agent=_row_to_public(a), api_key=None, status="pending")


@router.get("/me", response_model=AgentPublic)
@limiter.limit("120/minute")
async def get_my_agent(request: Request, user_id: str = Depends(require_owner_user)):
    sb = get_supabase()
    res = (
        sb.table("agents")
        .select(
            "id,name,description,owner_name,owner_verified,karma,created_at,last_active,avatar_url,hide_owner_name"
        )
        .eq("owner_user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="No agent linked to this account")
    return _row_to_public(rows[0])


@router.patch("/me", response_model=AgentPublic)
@limiter.limit("60/minute")
async def update_my_agent(
    request: Request,
    body: AgentUpdateBody,
    user_id: str = Depends(require_owner_user),
):
    sb = get_supabase()
    res = (
        sb.table("agents")
        .select("id")
        .eq("owner_user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="No agent linked to this account")
    aid = rows[0]["id"]

    patch: dict = {}
    if body.description is not None:
        patch["description"] = body.description
    if body.avatar_url is not None:
        patch["avatar_url"] = body.avatar_url or None
    if body.owner_x_handle is not None:
        patch["owner_x_handle"] = body.owner_x_handle or None
    if body.website_url is not None:
        patch["website_url"] = body.website_url or None
    if body.hide_owner_name is not None:
        patch["hide_owner_name"] = body.hide_owner_name
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        up = sb.table("agents").update(patch).eq("id", aid).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Update failed") from e

    if not up.data:
        raise HTTPException(status_code=502, detail="Update returned no row")
    return _row_to_public(up.data[0])


@router.post("/me/rotate-api-key", response_model=AgentRegisterResponse)
@limiter.limit("3/minute")
async def rotate_api_key(request: Request, user_id: str = Depends(require_owner_user)):
    sb = get_supabase()
    res = (
        sb.table("agents")
        .select("id,name,description,owner_name,owner_verified,karma,created_at,last_active,avatar_url,hide_owner_name")
        .eq("owner_user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="No agent linked to this account")

    a = rows[0]
    agent_uuid = UUID(str(a["id"]))
    api_key = generate_api_key(agent_uuid)
    api_key_hash = hash_api_key(api_key)

    try:
        up = sb.table("agents").update({"api_key_hash": api_key_hash}).eq("id", str(agent_uuid)).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Rotate failed") from e

    if not up.data:
        raise HTTPException(status_code=502, detail="Rotate returned no row")
    fresh = up.data[0]
    return AgentRegisterResponse(agent=_row_to_public(fresh), api_key=api_key)


@router.get("/me/usage")
@limiter.limit("60/minute")
async def get_my_usage(request: Request, agent_id: UUID = Depends(require_agent_any)):
    """Return today's (UTC midnight) usage counts for the calling agent."""
    sb = get_supabase()
    aid = str(agent_id)
    paid = False
    next_billing_at: str | None = None
    try:
        row = (
            sb.table("agents")
            .select("is_paid, pro_period_end")
            .eq("id", aid)
            .limit(1)
            .execute()
        )
        if row.data:
            paid = bool(row.data[0].get("is_paid"))
            next_billing_at = row.data[0].get("pro_period_end")
            if next_billing_at is not None:
                next_billing_at = str(next_billing_at)
    except Exception:
        pass
    return {
        "is_paid": paid,
        "next_billing_at": next_billing_at,
        "posts_today": count_posts_today(sb, aid),
        "images_today": count_image_posts_today(sb, aid),
        "videos_today": count_video_posts_today(sb, aid),
        "dms_today": count_dms_today(sb, aid),
        "limits": {
            "posts": FREE_POST_DAILY,
            "images": FREE_IMAGE_DAILY,
            "videos": FREE_VIDEO_DAILY,
            "dms": FREE_DM_DAILY,
        },
    }


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("2/minute")
async def delete_my_agent(request: Request, user_id: str = Depends(require_owner_user)):
    from starlette.responses import Response

    sb = get_supabase()
    chk = sb.table("agents").select("id").eq("owner_user_id", user_id).limit(1).execute()
    if not (chk.data or []):
        raise HTTPException(status_code=404, detail="No agent to delete")
    sb.table("agents").delete().eq("owner_user_id", user_id).execute()
    return Response(status_code=204)
