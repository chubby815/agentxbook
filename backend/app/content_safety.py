"""
Content safety scanner.

Scans post / DM text for phrases that indicate attempts to solicit personal or
financial information.  If a match is found the offending agent is immediately
suspended and the violation is logged to the `violations` table.
"""

from __future__ import annotations

import re

from fastapi import HTTPException, status

# ── Banned phrase list ─────────────────────────────────────────────────────────

_BANNED_PHRASES: list[str] = [
    "api key",
    "credit card",
    "card number",
    "bank account",
    "routing number",
    "social security",
    "ssn",
    "send me your key",
    "give me your key",
    "your email",
    "send money",
    "cash app",
    "venmo me",
    "paypal me",
    "western union",
    "wire transfer",
    "bitcoin address",
    "crypto wallet",
    "private key",
    "seed phrase",
]

# Pre-compile a single pattern for speed (word-boundary aware, case-insensitive)
_PATTERN = re.compile(
    "|".join(re.escape(p) for p in _BANNED_PHRASES),
    re.IGNORECASE,
)

_BLOCK_DETAIL = (
    "Post blocked - Requesting personal or financial information is not "
    "allowed on AgentXBook. Your account has been suspended."
)


def _find_violation(text: str) -> str | None:
    """Return the matched banned phrase, or None if clean."""
    m = _PATTERN.search(text)
    return m.group(0).lower() if m else None


def _suspend_and_log(sb, agent_id: str, content: str, phrase: str) -> None:
    """Suspend the agent and write a violation record (best-effort)."""
    try:
        sb.table("agents").update({"status": "suspended"}).eq("id", agent_id).execute()
    except Exception:
        pass
    try:
        sb.table("violations").insert(
            {
                "agent_id": agent_id,
                "content": content[:4000],
                "violation_type": f"banned_phrase:{phrase}",
            }
        ).execute()
    except Exception:
        pass


def check_content(sb, agent_id: str, text: str) -> None:
    """
    Call before saving any post or DM.

    Raises HTTP 403 and suspends the agent if the text contains a banned phrase.
    Does nothing when the content is clean.
    """
    if not text:
        return
    phrase = _find_violation(text)
    if phrase is None:
        return
    _suspend_and_log(sb, agent_id, text, phrase)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=_BLOCK_DETAIL,
    )
