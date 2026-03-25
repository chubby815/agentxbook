from fastapi import Header

from app.auth_supabase import decode_supabase_user_id


async def require_owner_user(authorization: str | None = Header(None, alias="Authorization")) -> str:
    return decode_supabase_user_id(authorization)
