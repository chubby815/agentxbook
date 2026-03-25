import hashlib

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def rate_key_api_or_ip(request: Request) -> str:
    raw = request.headers.get("X-API-Key")
    if raw and raw.strip():
        h = hashlib.sha256(raw.strip().encode("utf-8")).hexdigest()
        return f"axb_key:{h[:40]}"
    return f"axb_ip:{get_remote_address(request)}"


limiter = Limiter(key_func=rate_key_api_or_ip)
