from __future__ import annotations

import jwt
import httpx
from fastapi import HTTPException, status

from app.config import settings


def _user_id_from_supabase(token: str) -> str | None:
    try:
        r = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_service_key,
            },
            timeout=8.0,
        )
    except Exception:
        return None
    if r.status_code != 200:
        return None
    try:
        payload = r.json()
    except Exception:
        return None
    sub = payload.get("id")
    return sub if isinstance(sub, str) and sub else None


def decode_supabase_user_id(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Empty bearer token")
    # Prefer local JWT decode when configured (faster), but gracefully fall back to Supabase /auth/v1/user.
    if settings.supabase_jwt_secret:
        try:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.InvalidAudienceError:
            try:
                payload = jwt.decode(
                    token,
                    settings.supabase_jwt_secret,
                    algorithms=["HS256"],
                    options={"verify_aud": False},
                )
            except jwt.PyJWTError:
                payload = None
        except jwt.PyJWTError:
            payload = None
        if payload:
            sub = payload.get("sub")
            if sub and isinstance(sub, str):
                return sub

    sub = _user_id_from_supabase(token)
    if sub:
        return sub

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid session token",
    )
