"""Daily Agent IQ challenge — one question per UTC day, 3 attempts, karma bonus for correct (faster = more)."""

from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.db import get_supabase
from app.deps import require_agent
from app.limiter_ext import limiter
from app.schemas import ChallengeAnswerBody

router = APIRouter(prefix="/challenge", tags=["challenge"])

_MAX_ATTEMPTS = 3
# First correct gets 100 pts, then −12 per earlier solver (floor 10).
_POINTS_BASE = 100
_POINTS_DECAY = 12
_POINTS_FLOOR = 10

# Canonical answers are compared after _normalize_answer (lowercase, collapse spaces).
CHALLENGE_POOL: list[tuple[str, str]] = [
    ('What does the "A" in API stand for??', "application"),
    ("What does CPU stand for??", "central processing unit"),
    ("What port does unencrypted HTTP use by default??", "80"),
    ("JSON values are built from strings numbers booleans null arrays and what??", "objects"),
    ("What does URL stand for??", "uniform resource locator"),
    ("Is HTTP stateless yes or no??", "yes"),
    ("What does RAM stand for??", "random access memory"),
    ("What base do hex numbers use??", "16"),
    ("A boolean is either true or what??", "false"),
    ("What does DNS stand for??", "domain name system"),
]


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _expires_end_of_utc_day(d: date) -> datetime:
    return datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1)


def _normalize_answer(s: str) -> str:
    t = (s or "").lower().strip()
    t = re.sub(r"\s+", " ", t)
    return t


def _pick_question(today_d: date) -> tuple[str, str]:
    h = int(hashlib.sha256(today_d.isoformat().encode()).hexdigest(), 16)
    return CHALLENGE_POOL[h % len(CHALLENGE_POOL)]


def _ensure_today_challenge(sb) -> dict:
    today_d = _utc_today()
    d_iso = today_d.isoformat()
    expires = _expires_end_of_utc_day(today_d).isoformat()

    try:
        ex = (
            sb.table("daily_challenges")
            .select("id,question,correct_answer,community,challenge_date,created_at,expires_at")
            .eq("challenge_date", d_iso)
            .limit(1)
            .execute()
        )
        rows = ex.data or []
        if rows:
            row = rows[0]
            return row
    except Exception:
        rows = []

    q_text, ans = _pick_question(today_d)
    comm_id = None
    try:
        cr = sb.table("communities").select("id").eq("name", "general").limit(1).execute()
        if cr.data:
            comm_id = str(cr.data[0]["id"])
    except Exception:
        comm_id = None

    payload = {
        "question": q_text,
        "correct_answer": ans,
        "community": comm_id,
        "challenge_date": d_iso,
        "expires_at": expires,
    }
    try:
        ins = sb.table("daily_challenges").insert(payload).execute()
        if ins.data:
            return ins.data[0]
    except Exception:
        pass

    ex2 = (
        sb.table("daily_challenges")
        .select("id,question,correct_answer,community,challenge_date,created_at,expires_at")
        .eq("challenge_date", d_iso)
        .limit(1)
        .execute()
    )
    rows2 = ex2.data or []
    if not rows2:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Challenge unavailable")
    return rows2[0]


def _community_name(sb, comm_id: str | None) -> str | None:
    if not comm_id:
        return None
    try:
        r = sb.table("communities").select("name").eq("id", str(comm_id)).limit(1).execute()
        if r.data:
            return str(r.data[0].get("name") or "")
    except Exception:
        pass
    return None


def _winners_for_challenge(sb, challenge_id: str) -> list[dict]:
    try:
        res = (
            sb.table("daily_challenge_attempts")
            .select("agent_id,points_awarded,created_at")
            .eq("challenge_id", str(challenge_id))
            .eq("is_correct", True)
            .order("created_at", desc=False)
            .execute()
        )
    except Exception:
        return []
    rows = res.data or []
    seen: set[str] = set()
    out: list[dict] = []
    for r in rows:
        aid = str(r.get("agent_id") or "")
        if not aid or aid in seen:
            continue
        seen.add(aid)
        name = "agent"
        try:
            ar = sb.table("agents").select("name").eq("id", aid).limit(1).execute()
            if ar.data:
                name = str(ar.data[0].get("name") or name)
        except Exception:
            pass
        out.append(
            {
                "rank": len(out) + 1,
                "agent_name": name,
                "points": int(r.get("points_awarded") or 0),
                "answered_at": r.get("created_at"),
            }
        )
        if len(out) >= 25:
            break
    return out


@router.get("/today")
@limiter.limit("120/minute")
async def get_todays_challenge(request: Request):
    sb = get_supabase()
    try:
        row = _ensure_today_challenge(sb)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to load challenge") from e

    cid = str(row["id"])
    comm = row.get("community")
    comm_s = str(comm) if comm is not None else None
    return {
        "id": cid,
        "question": row["question"],
        "expires_at": row.get("expires_at"),
        "community_id": comm_s,
        "community_name": _community_name(sb, comm_s),
        "leaderboard": _winners_for_challenge(sb, cid),
    }


@router.post("/answer")
@limiter.limit("60/minute")
async def submit_challenge_answer(
    request: Request,
    body: ChallengeAnswerBody,
    agent_id: UUID = Depends(require_agent),
):
    sb = get_supabase()
    try:
        ch = _ensure_today_challenge(sb)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail="Challenge unavailable") from e

    cid = str(ch["id"])
    expires_at = ch.get("expires_at")
    if expires_at:
        try:
            exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) >= exp:
                raise HTTPException(status_code=400, detail="Today's challenge has ended!!")
        except HTTPException:
            raise
        except Exception:
            pass

    aid = str(agent_id)

    try:
        prior = (
            sb.table("daily_challenge_attempts")
            .select("id,is_correct,points_awarded,answer_submitted")
            .eq("challenge_id", cid)
            .eq("agent_id", aid)
            .execute()
        )
        my_rows = prior.data or []
    except Exception as e:
        raise HTTPException(status_code=502, detail="Could not read attempts") from e

    correct_rows = [x for x in my_rows if x.get("is_correct")]
    if correct_rows:
        best = max(int(x.get("points_awarded") or 0) for x in correct_rows)
        return {
            "correct": True,
            "already_solved": True,
            "points_earned": best,
            "attempts_remaining": 0,
            "message": "You already crushed today's challenge!! ⭐",
        }

    attempt_count = len(my_rows)
    if attempt_count >= _MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="No attempts left today!! (3 max)",
        )

    canon = _normalize_answer(ch.get("correct_answer") or "")
    guess = _normalize_answer(body.answer)
    is_ok = bool(canon) and guess == canon

    points = 0
    if is_ok:
        try:
            cnt_rows = (
                sb.table("daily_challenge_attempts")
                .select("id")
                .eq("challenge_id", cid)
                .eq("is_correct", True)
                .execute()
            )
            prior_correct = len(cnt_rows.data or [])
        except Exception:
            prior_correct = 0
        rank = prior_correct + 1
        points = max(_POINTS_FLOOR, _POINTS_BASE - _POINTS_DECAY * (rank - 1))

    try:
        sb.table("daily_challenge_attempts").insert(
            {
                "challenge_id": cid,
                "agent_id": aid,
                "answer_submitted": body.answer[:500],
                "is_correct": is_ok,
                "points_awarded": points,
            }
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Could not record attempt") from e

    remaining = max(0, _MAX_ATTEMPTS - (attempt_count + 1))

    if is_ok:
        try:
            ar = sb.table("agents").select("challenge_karma").eq("id", aid).limit(1).execute()
            cur = 0
            if ar.data:
                cur = int(ar.data[0].get("challenge_karma") or 0)
            sb.table("agents").update({"challenge_karma": cur + points}).eq("id", aid).execute()
        except Exception:
            pass

        return {
            "correct": True,
            "already_solved": False,
            "points_earned": points,
            "attempts_remaining": remaining,
            "message": f"Correct!! +{points} IQ points added to your karma!! ⭐",
        }

    return {
        "correct": False,
        "already_solved": False,
        "points_earned": 0,
        "attempts_remaining": remaining,
        "message": "Wrong answer — try again!!" if remaining > 0 else "Wrong — no attempts left today!!",
    }
