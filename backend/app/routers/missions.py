"""Missions — Pac-Man-style grid game for AI agents.

Level 1: no ghosts
Level 2: 1 ghost (moves every other turn)
Level 3: 2 faster ghosts (move every turn)

Grid legend (stored in game_state):
  0 = empty
  1 = wall
  2 = dot
  P = agent position {row, col}
  ghosts = list of {row, col, dir}

Max 3 attempts per UTC day (resets at midnight UTC).
"""

from __future__ import annotations

import copy
import random
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status

from app.db import get_supabase
from app.deps import require_agent_any
from app.limiter_ext import limiter

router = APIRouter(prefix="/missions", tags=["missions"])

_MAX_ATTEMPTS = 3
_ROWS = 15
_COLS = 15

# ─── map template (1=wall, 0=open; dots filled in at start time) ─────────────
_BASE_MAP: list[list[int]] = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
]

_AGENT_START = {"row": 7, "col": 7}

_GHOST_STARTS = [
    {"row": 1, "col": 1, "dir": "right"},
    {"row": 1, "col": 13, "dir": "left"},
]

_DIRS: dict[str, tuple[int, int]] = {
    "up": (-1, 0),
    "down": (1, 0),
    "left": (0, -1),
    "right": (0, 1),
}


# ─── helpers ──────────────────────────────────────────────────────────────────

def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _build_initial_grid() -> list[list[int]]:
    grid = copy.deepcopy(_BASE_MAP)
    for r in range(_ROWS):
        for c in range(_COLS):
            if grid[r][c] == 0:
                grid[r][c] = 2  # place dot
    # Clear agent start cell
    grid[_AGENT_START["row"]][_AGENT_START["col"]] = 0
    return grid


def _count_dots(grid: list[list[int]]) -> int:
    return sum(cell == 2 for row in grid for cell in row)


def _ghost_count_for_level(level: int) -> int:
    if level == 1:
        return 0
    if level == 2:
        return 1
    return 2


def _ghost_moves_every(level: int) -> int:
    """Number of player moves between ghost moves (lower = faster)."""
    if level == 3:
        return 1
    return 2  # level 2


def _next_ghost_pos(ghost: dict, grid: list[list[int]]) -> dict:
    """Move ghost one step; bounce/turn on walls."""
    dr, dc = _DIRS.get(ghost["dir"], (0, 1))
    nr, nc = ghost["row"] + dr, ghost["col"] + dc
    if 0 <= nr < _ROWS and 0 <= nc < _COLS and grid[nr][nc] != 1:
        return {**ghost, "row": nr, "col": nc}
    # Try turning: pick a random valid direction
    options = [d for d, (dr2, dc2) in _DIRS.items()
               if 0 <= ghost["row"] + dr2 < _ROWS
               and 0 <= ghost["col"] + dc2 < _COLS
               and grid[ghost["row"] + dr2][ghost["col"] + dc2] != 1
               and d != ghost["dir"]]
    if options:
        new_dir = random.choice(options)
        dr2, dc2 = _DIRS[new_dir]
        return {**ghost, "row": ghost["row"] + dr2, "col": ghost["col"] + dc2, "dir": new_dir}
    return ghost  # completely stuck (shouldn't happen on this map)


def _serialize_state(gs: dict) -> dict[str, Any]:
    return {
        "level": gs["level"],
        "score": gs["score"],
        "grid": gs["grid"],
        "agent": gs["agent"],
        "ghosts": gs["ghosts"],
        "dots_remaining": _count_dots(gs["grid"]),
        "move_count": gs.get("move_count", 0),
        "status": gs.get("status", "playing"),
    }


# ─── DB helpers ───────────────────────────────────────────────────────────────

def _get_mission_row(sb, agent_id: str) -> dict | None:
    res = (
        sb.table("missions")
        .select("*")
        .eq("agent_id", agent_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def _upsert_mission(sb, agent_id: str, row_id: str | None, game_state: dict, score: int,
                    level: int, status_: str, attempts: int, attempt_date: date) -> dict:
    payload: dict[str, Any] = {
        "agent_id": agent_id,
        "level": level,
        "score": score,
        "status": status_,
        "game_state": game_state,
        "attempts_today": attempts,
        "last_attempt_date": attempt_date.isoformat(),
    }
    if row_id:
        sb.table("missions").update(payload).eq("id", row_id).execute()
        return {**payload, "id": row_id}
    res = sb.table("missions").insert(payload).execute()
    return (res.data or [{}])[0]


# ─── endpoints ────────────────────────────────────────────────────────────────

@router.post("/start", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def start_mission(
    request: Request,
    agent_id: UUID = Depends(require_agent_any),
):
    """Start / restart a mission. Max 3 attempts per UTC day."""
    sb = get_supabase()
    aid = str(agent_id)
    today = _utc_today()

    existing = _get_mission_row(sb, aid)
    attempts_today = 0
    row_id: str | None = None

    if existing:
        row_id = str(existing["id"])
        last_date_str = existing.get("last_attempt_date")
        if last_date_str:
            try:
                last_date = date.fromisoformat(str(last_date_str)[:10])
                if last_date == today:
                    attempts_today = int(existing.get("attempts_today") or 0)
            except ValueError:
                pass

    if attempts_today >= _MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Max {_MAX_ATTEMPTS} mission attempts per day. Try again tomorrow!!",
        )

    # Build fresh level-1 state
    grid = _build_initial_grid()
    gs = {
        "level": 1,
        "score": 0,
        "grid": grid,
        "agent": dict(_AGENT_START),
        "ghosts": [],
        "move_count": 0,
        "status": "playing",
    }

    _upsert_mission(
        sb, aid, row_id, _serialize_state(gs), 0, 1, "playing",
        attempts_today + 1, today,
    )
    return {**gs, "dots_remaining": _count_dots(grid), "attempts_today": attempts_today + 1}


@router.get("/current")
@limiter.limit("60/minute")
async def current_mission(
    request: Request,
    agent_id: UUID = Depends(require_agent_any),
):
    """Return the current game state for the calling agent."""
    sb = get_supabase()
    row = _get_mission_row(sb, str(agent_id))
    if not row or row.get("status") == "not_started":
        raise HTTPException(status_code=404, detail="No active mission. Call POST /missions/start first.")
    gs = row.get("game_state") or {}
    return {**gs, "attempts_today": int(row.get("attempts_today") or 0)}


@router.post("/move")
@limiter.limit("120/minute")
async def move_mission(
    request: Request,
    direction: str = Body(..., embed=True),
    agent_id: UUID = Depends(require_agent_any),
):
    """Move the agent one step. direction: up | down | left | right"""
    direction = (direction or "").strip().lower()
    if direction not in _DIRS:
        raise HTTPException(status_code=400, detail="direction must be up, down, left, or right")

    sb = get_supabase()
    aid = str(agent_id)
    row = _get_mission_row(sb, aid)
    if not row:
        raise HTTPException(status_code=404, detail="No active mission. Call POST /missions/start first.")

    gs = dict(row.get("game_state") or {})
    if gs.get("status") in ("won", "dead", "complete"):
        return {**gs, "message": "Game over. Call /start for a new game."}

    grid: list[list[int]] = gs["grid"]
    agent: dict = dict(gs["agent"])
    ghosts: list[dict] = [dict(g) for g in (gs.get("ghosts") or [])]
    score: int = int(gs.get("score") or 0)
    level: int = int(gs.get("level") or 1)
    move_count: int = int(gs.get("move_count") or 0)

    # ── move agent ──
    dr, dc = _DIRS[direction]
    nr, nc = agent["row"] + dr, agent["col"] + dc

    if not (0 <= nr < _ROWS and 0 <= nc < _COLS) or grid[nr][nc] == 1:
        # Bumped a wall — no movement, return state unchanged
        return {**_serialize_state({**gs, "grid": grid, "agent": agent, "ghosts": ghosts,
                                    "score": score, "level": level, "move_count": move_count}),
                "message": "Wall!!", "attempts_today": int(row.get("attempts_today") or 0)}

    agent["row"] = nr
    agent["col"] = nc

    # Collect dot
    if grid[nr][nc] == 2:
        grid[nr][nc] = 0
        score += 10

    move_count += 1

    # ── move ghosts ──
    ghost_speed = _ghost_moves_every(level)
    if ghosts and (move_count % ghost_speed == 0):
        ghosts = [_next_ghost_pos(g, grid) for g in ghosts]

    # ── check ghost collision ──
    def _touching_ghost() -> bool:
        return any(g["row"] == agent["row"] and g["col"] == agent["col"] for g in ghosts)

    game_status = "playing"
    message = ""

    if _touching_ghost():
        game_status = "dead"
        message = "Caught by a ghost!!"
    else:
        dots_left = _count_dots(grid)
        if dots_left == 0:
            # Level complete
            if level >= 3:
                game_status = "complete"
                score += 500
                message = "Mission complete!! All levels cleared!! 🎉"
            else:
                # Advance to next level
                level += 1
                grid = _build_initial_grid()
                agent = dict(_AGENT_START)
                ghost_count = _ghost_count_for_level(level)
                ghosts = [dict(_GHOST_STARTS[i]) for i in range(ghost_count)]
                score += 200  # level-clear bonus
                move_count = 0
                game_status = "playing"
                message = f"Level {level} started!! 🚀"
        else:
            message = ""

    new_gs = {
        "level": level,
        "score": score,
        "grid": grid,
        "agent": agent,
        "ghosts": ghosts,
        "move_count": move_count,
        "status": game_status,
    }

    _upsert_mission(
        sb, aid, str(row["id"]), _serialize_state(new_gs), score,
        level, game_status, int(row.get("attempts_today") or 1),
        _utc_today(),
    )

    return {
        **_serialize_state(new_gs),
        "message": message,
        "attempts_today": int(row.get("attempts_today") or 1),
    }
