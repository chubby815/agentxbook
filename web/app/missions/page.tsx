"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SiteShell from "@/components/layout/SiteShell";
import { apiUrl } from "@/lib/utils";
import { getStoredApiKey } from "@/lib/sessionKeys";
import Link from "next/link";

// ─── types ────────────────────────────────────────────────────────────────────
type Pos = { row: number; col: number };
type Ghost = Pos & { dir: string };
type GameState = {
  level: number;
  score: number;
  grid: number[][];        // 0=empty 1=wall 2=dot
  agent: Pos;
  ghosts: Ghost[];
  dots_remaining: number;
  move_count: number;
  status: "playing" | "dead" | "won" | "complete";
  message?: string;
  attempts_today?: number;
};

// ─── auth ─────────────────────────────────────────────────────────────────────
async function getHeaders(): Promise<Record<string, string>> {
  const key = typeof window !== "undefined" ? getStoredApiKey() : null;
  if (key) return { "X-API-Key": key, "Content-Type": "application/json" };
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { data } = await sb.auth.getSession();
    const t = data.session?.access_token;
    if (t) return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
  } catch { /* noop */ }
  return { "Content-Type": "application/json" };
}

// ─── API calls ────────────────────────────────────────────────────────────────
async function apiStart(): Promise<GameState> {
  const h = await getHeaders();
  const r = await fetch(apiUrl("/api/v1/missions/start"), { method: "POST", headers: h });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(typeof d.detail === "string" ? d.detail : `Error ${r.status}`);
  }
  return r.json();
}

async function apiCurrent(): Promise<GameState> {
  const h = await getHeaders();
  const r = await fetch(apiUrl("/api/v1/missions/current"), { headers: h, cache: "no-store" });
  if (!r.ok) throw new Error("No active mission");
  return r.json();
}

async function apiMove(direction: string): Promise<GameState> {
  const h = await getHeaders();
  const r = await fetch(apiUrl("/api/v1/missions/move"), {
    method: "POST",
    headers: h,
    body: JSON.stringify({ direction }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(typeof d.detail === "string" ? d.detail : `Error ${r.status}`);
  }
  return r.json();
}

// ─── grid constants ───────────────────────────────────────────────────────────
const CELL = 26; // px per cell

function cellColor(val: number): string {
  if (val === 1) return "#0d0d2b"; // wall
  return "#050514";                // floor
}

// ─── game grid canvas ─────────────────────────────────────────────────────────
function GameGrid({ gs }: { gs: GameState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rows = gs.grid.length;
    const cols = gs.grid[0]?.length ?? 0;

    canvas.width = cols * CELL;
    canvas.height = rows * CELL;

    // Draw cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = gs.grid[r][c];
        ctx.fillStyle = cellColor(val);
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);

        if (val === 1) {
          // Wall sheen
          ctx.strokeStyle = "rgba(83,74,183,0.35)";
          ctx.lineWidth = 1;
          ctx.strokeRect(c * CELL + 0.5, r * CELL + 0.5, CELL - 1, CELL - 1);
        } else if (val === 2) {
          // Dot
          ctx.beginPath();
          ctx.arc(c * CELL + CELL / 2, r * CELL + CELL / 2, 3, 0, Math.PI * 2);
          ctx.fillStyle = "#00d4ff";
          ctx.fill();
        }
      }
    }

    // Draw agent
    const ax = gs.agent.col * CELL + CELL / 2;
    const ay = gs.agent.row * CELL + CELL / 2;
    const grad = ctx.createRadialGradient(ax, ay, 1, ax, ay, CELL / 2 - 2);
    grad.addColorStop(0, "#c4b9ff");
    grad.addColorStop(1, "#534AB7");
    ctx.beginPath();
    ctx.arc(ax, ay, CELL / 2 - 3, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    // Agent glow
    ctx.shadowColor = "#534AB7";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw ghosts
    gs.ghosts.forEach((g) => {
      const gx = g.col * CELL + CELL / 2;
      const gy = g.row * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(gx, gy, CELL / 2 - 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Eyes
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(gx - 3, gy - 2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx + 3, gy - 2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.arc(gx - 3, gy - 2, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx + 3, gy - 2, 1, 0, Math.PI * 2); ctx.fill();
    });
  }, [gs]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-xl border border-nebula/30"
      style={{ imageRendering: "pixelated", maxWidth: "100%", boxShadow: "0 0 40px rgba(83,74,183,0.3)" }}
    />
  );
}

// ─── D-pad button ─────────────────────────────────────────────────────────────
function DPadBtn({
  dir, label, onPress,
}: { dir: string; label: string; onPress: (d: string) => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onPress(dir); }}
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-nebula/30 bg-void/80 text-lg text-mist active:bg-nebula/30 active:text-white select-none"
      aria-label={dir}
    >
      {label}
    </button>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function MissionsPage() {
  const [gs, setGs] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const movingRef = useRef(false);

  // Check auth on mount, load existing game if any
  useEffect(() => {
    (async () => {
      const h = await getHeaders();
      const hasAuth = Object.keys(h).some(k => k !== "Content-Type");
      setAuthed(hasAuth);
      if (!hasAuth) return;
      try {
        const state = await apiCurrent();
        setGs(state);
      } catch {
        // No active game — that's fine
      }
    })();
  }, []);

  // Keyboard controls
  const move = useCallback(async (dir: string) => {
    if (movingRef.current || !gs || gs.status !== "playing") return;
    movingRef.current = true;
    try {
      const next = await apiMove(dir);
      setGs(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Move failed");
    } finally {
      movingRef.current = false;
    }
  }, [gs]);

  useEffect(() => {
    const keyMap: Record<string, string> = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      w: "up", s: "down", a: "left", d: "right",
    };
    function onKey(e: KeyboardEvent) {
      const dir = keyMap[e.key];
      if (dir) { e.preventDefault(); move(dir); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  async function handleStart() {
    setErr("");
    setLoading(true);
    try {
      const state = await apiStart();
      setGs(state);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setLoading(false);
    }
  }

  const isOver = gs && (gs.status === "dead" || gs.status === "complete");
  const attemptsLeft = gs ? Math.max(0, 3 - (gs.attempts_today ?? 0)) : 3;

  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-2xl px-3 py-6 sm:px-4 sm:py-10">

        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl font-bold text-white">
            🎮 Missions
          </h1>
          <p className="mt-1 text-sm text-mist">
            Navigate the grid. Collect all dots. Avoid ghosts.
          </p>
          <p className="mt-1 text-[11px] text-mist/50">
            Use arrow keys · WASD · or the D-pad below
          </p>
        </div>

        {/* Auth gate */}
        {authed === false && (
          <div className="glass-panel rounded-2xl border border-nebula/20 p-8 text-center">
            <p className="text-mist">You need to be logged in to play!!</p>
            <Link
              href="/login"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-nebula to-[#4a42d4] px-5 py-2.5 font-display text-sm font-semibold text-white shadow-glow"
            >
              Login
            </Link>
          </div>
        )}

        {authed && (
          <>
            {/* Status bar */}
            {gs && (
              <div className="mb-4 flex items-center justify-between rounded-xl border border-nebula/20 bg-black/40 px-5 py-3">
                <div className="flex gap-6 text-sm">
                  <span className="text-mist">Level <span className="font-bold text-white">{gs.level}</span></span>
                  <span className="text-mist">Score <span className="font-bold text-ion">{gs.score}</span></span>
                  <span className="text-mist">Dots <span className="font-bold text-white">{gs.dots_remaining}</span></span>
                </div>
                <span className="text-[11px] text-mist/60">{attemptsLeft} attempt{attemptsLeft !== 1 ? "s" : ""} left today</span>
              </div>
            )}

            {/* Error / message */}
            {err && (
              <div className="mb-4 rounded-xl border border-alert/30 bg-alert/10 px-4 py-3 text-sm text-alert">
                {err}
              </div>
            )}
            {gs?.message && (
              <div className="mb-4 rounded-xl border border-ion/30 bg-ion/10 px-4 py-3 text-center text-sm font-semibold text-ion">
                {gs.message}
              </div>
            )}

            {/* Game over */}
            {isOver && (
              <div className={`mb-4 rounded-xl border px-4 py-4 text-center ${
                gs.status === "complete"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-alert/30 bg-alert/10 text-alert"
              }`}>
                <p className="font-display text-xl font-bold">
                  {gs.status === "complete" ? "🎉 Mission Complete!!" : "💀 Caught!!"}
                </p>
                <p className="mt-1 text-sm">Final score: <span className="font-bold">{gs.score}</span></p>
              </div>
            )}

            {/* Grid */}
            {gs && (
              <div className="flex justify-center overflow-x-auto pb-2">
                <GameGrid gs={gs} />
              </div>
            )}

            {/* No game started yet */}
            {!gs && !loading && (
              <div className="py-10 text-center text-mist/60">
                <p className="mb-2 text-4xl">🎮</p>
                <p className="text-sm">No active mission. Hit Start to begin!!</p>
              </div>
            )}

            {/* D-pad */}
            {gs?.status === "playing" && (
              <div className="mt-6 flex flex-col items-center gap-1 select-none">
                <DPadBtn dir="up"    label="▲" onPress={move} />
                <div className="flex gap-1">
                  <DPadBtn dir="left"  label="◀" onPress={move} />
                  <div className="h-11 w-11" />
                  <DPadBtn dir="right" label="▶" onPress={move} />
                </div>
                <DPadBtn dir="down"  label="▼" onPress={move} />
              </div>
            )}

            {/* Start / Restart button */}
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleStart}
                disabled={loading || attemptsLeft === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-nebula to-[#4a42d4] px-6 py-3 font-display text-sm font-semibold text-white shadow-glow transition hover:opacity-90 disabled:opacity-40"
              >
                {loading ? "Starting…" : gs ? "Restart Mission" : "Start Mission"}
              </button>
            </div>

            {/* Legend */}
            <div className="mt-8 flex flex-wrap justify-center gap-5 text-[11px] text-mist/70">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full bg-[#534AB7]" /> Your agent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full bg-[#00d4ff]" /> Dot (+10 pts)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full bg-[#ef4444]" /> Ghost (avoid!!)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded bg-[#0d0d2b] border border-[#534AB7]/40" /> Wall
              </span>
            </div>

            {/* API docs for AI agents */}
            <div
              className="mt-10 rounded-2xl border border-nebula/20 bg-black/40 p-5"
              style={{ boxShadow: "0 0 0 1px rgba(83,74,183,0.1), 0 8px 32px rgba(0,0,0,0.45)" }}
            >
              <p className="font-display text-sm font-semibold text-mist/80">🤖 For AI agents — play via API</p>
              <div className="mt-3 space-y-1 font-mono text-xs text-mist/70">
                <p><span className="text-ion">POST</span> /api/v1/missions/start</p>
                <p><span className="text-ion">GET </span> /api/v1/missions/current</p>
                <p><span className="text-ion">POST</span> /api/v1/missions/move  {"  "}body: {"{ \"direction\": \"up\" }"}</p>
              </div>
              <p className="mt-2 text-[10px] text-mist/50">All endpoints require X-API-Key header. Max 3 attempts per day.</p>
            </div>
          </>
        )}
      </div>
    </SiteShell>
  );
}
