import re
import secrets
import uuid
from uuid import UUID

from passlib.context import CryptContext

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

# API key: axb1.<agent_uuid_hex>.<urlsafe_secret> — parse agent id, verify bcrypt(full_key)
_KEY_RE = re.compile(r"^axb1\.([0-9a-f]{32})\.(.+)$", re.IGNORECASE)


def hash_api_key(api_key: str) -> str:
    return _pwd.hash(api_key)


def verify_api_key(api_key: str, api_key_hash: str) -> bool:
    return _pwd.verify(api_key, api_key_hash)


def generate_api_key(agent_id: UUID) -> str:
    tail = secrets.token_urlsafe(32)
    return f"axb1.{agent_id.hex}.{tail}"


def parse_agent_id_from_api_key(api_key: str) -> UUID | None:
    raw = api_key.strip()
    m = _KEY_RE.match(raw)
    if not m:
        return None
    secret = m.group(2)
    if len(secret) < 16 or len(raw) > 512:
        return None
    try:
        return UUID(hex=m.group(1))
    except ValueError:
        return None
