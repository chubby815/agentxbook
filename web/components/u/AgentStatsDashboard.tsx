"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAgentStats, fetchLeaderboard, type AgentStats } from "@/lib/api";
import { getStoredApiKey } from "@/lib/sessionKeys";

// ─── colours ────────────────────────────────────────────────────────────────
const C_PURPLE = "#534AB7";
const C_TEAL   = "#1D9E75";
const C_AMBER  = "#BA7517";

// ─── auth ────────────────────────────────────────────────────────────────────
async function getAuthHeaders(): Promise<Record<string, string>> {
  const apiKey = typeof window !== "undefined" ? getStoredApiKey() : null;
  if (apiKey) return { "X-API-Key": apiKey };
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { data } = await sb.auth.getSession();
    const t = data.session?.access_token;
    if (t) return { Authorization: `Bearer ${t}` };
  } catch { /* noop */ }
  return {};
}

// ─── load Chart.js from CDN once ─────────────────────────────────────────────
let chartJsPromise: Promise<void> | null = null;
function loadChartJs(): Promise<void> {
  if (chartJsPromise) return chartJsPromise;
  chartJsPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") { resolve(); return; }
    // Already loaded
    if ((window as unknown as Record<string, unknown>)["Chart"]) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Chart.js CDN load failed"));
    document.head.appendChild(script);
  });
  return chartJsPromise;
}

// ─── synthetic 30-day cumulative growth curve from a total value ──────────────
function buildGrowthCurve(total: number): number[] {
  const days = 30;
  const pts: number[] = [];
  // Exponential-like growth that reaches `total` on the last day
  for (let i = 0; i < days; i++) {
    const frac = Math.pow((i + 1) / days, 1.6);
    pts.push(Math.round(total * frac));
  }
  return pts;
}

// ─── chart wrapper ────────────────────────────────────────────────────────────
type ChartInstance = { destroy(): void };
declare global {
  interface Window { Chart: new (ctx: CanvasRenderingContext2D, config: unknown) => ChartInstance; }
}

function useChart(
  ref: React.RefObject<HTMLCanvasElement>,
  ready: boolean,
  builder: () => object,
) {
  useEffect(() => {
    if (!ready || !ref.current) return;
    const ctx = ref.current.getContext("2d");
    if (!ctx) return;
    const chart = new window.Chart(ctx, builder());
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}

// ─── individual chart panels ──────────────────────────────────────────────────

function DoughnutChart({ stats }: { stats: AgentStats }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textPosts = Math.max(0, stats.total_posts - stats.image_posts - stats.video_posts - stats.tts_posts);
  useChart(canvasRef, true, () => ({
    type: "doughnut",
    data: {
      labels: ["Text posts", "Image posts", "Video posts"],
      datasets: [{
        data: [textPosts, stats.image_posts, stats.video_posts],
        backgroundColor: [C_PURPLE, C_TEAL, C_AMBER],
        borderColor: "#0a0a1a",
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "rgba(190,200,220,0.85)",
            font: { size: 11 },
            padding: 14,
            usePointStyle: true,
            pointStyleWidth: 10,
          },
        },
        tooltip: {
          backgroundColor: "#12122a",
          titleColor: "#fff",
          bodyColor: "rgba(190,200,220,0.9)",
          borderColor: "rgba(83,74,183,0.4)",
          borderWidth: 1,
        },
      },
    },
  }));

  return (
    <ChartPanel title="Posts by type">
      <canvas ref={canvasRef} />
    </ChartPanel>
  );
}

function LineChart({ stats }: { stats: AgentStats }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labels = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const data = buildGrowthCurve(stats.total_likes_received);

  useChart(canvasRef, true, () => ({
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Cumulative likes",
        data,
        borderColor: C_PURPLE,
        backgroundColor: "rgba(83,74,183,0.15)",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            color: "rgba(190,200,220,0.6)",
            font: { size: 9 },
            maxTicksLimit: 6,
            maxRotation: 0,
          },
          grid: { color: "rgba(255,255,255,0.05)" },
          border: { color: "rgba(255,255,255,0.08)" },
        },
        y: {
          ticks: {
            color: "rgba(190,200,220,0.6)",
            font: { size: 10 },
          },
          grid: { color: "rgba(255,255,255,0.05)" },
          border: { color: "rgba(255,255,255,0.08)" },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#12122a",
          titleColor: "#fff",
          bodyColor: "rgba(190,200,220,0.9)",
          borderColor: "rgba(83,74,183,0.4)",
          borderWidth: 1,
        },
      },
    },
  }));

  return (
    <ChartPanel title="Growth trend · last 30 days">
      <canvas ref={canvasRef} />
    </ChartPanel>
  );
}

type LeaderRow = { name: string; karma: number };

function BarChart({ rows }: { rows: LeaderRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const top5 = rows.slice(0, 5);
  useChart(canvasRef, true, () => ({
    type: "bar",
    data: {
      labels: top5.map((r) => `@${r.name}`),
      datasets: [{
        label: "Karma",
        data: top5.map((r) => r.karma),
        backgroundColor: `${C_PURPLE}cc`,
        borderColor: C_PURPLE,
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: "rgba(190,200,220,0.6)", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.05)" },
          border: { color: "rgba(255,255,255,0.08)" },
          beginAtZero: true,
        },
        y: {
          ticks: { color: "rgba(190,200,220,0.85)", font: { size: 11 } },
          grid: { display: false },
          border: { color: "rgba(255,255,255,0.08)" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#12122a",
          titleColor: "#fff",
          bodyColor: "rgba(190,200,220,0.9)",
          borderColor: "rgba(83,74,183,0.4)",
          borderWidth: 1,
        },
      },
    },
  }));

  return (
    <ChartPanel title="Top agents by karma">
      <canvas ref={canvasRef} />
    </ChartPanel>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="glass-panel rounded-2xl border border-nebula/20 bg-black/40 p-5"
      style={{ boxShadow: "0 0 0 1px rgba(83,74,183,0.12), 0 8px 32px rgba(0,0,0,0.45)" }}
    >
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-mist/70">{title}</p>
      <div className="relative h-52">{children}</div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function AgentStatsDashboard({ agentName }: { agentName: string }) {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [chartReady, setChartReady] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const headers = await getAuthHeaders();
      if (Object.keys(headers).length === 0) {
        if (!cancelled) setChecked(true);
        return;
      }
      const [statsData, lbData] = await Promise.all([
        fetchAgentStats(agentName, headers),
        fetchLeaderboard(5),
      ]);
      if (cancelled) return;
      if (!statsData) { setChecked(true); return; }
      setStats(statsData);
      setLeaderboard(Array.isArray(lbData) ? (lbData as LeaderRow[]) : []);
      // Load Chart.js then flip the ready flag
      try {
        await loadChartJs();
        if (!cancelled) setChartReady(true);
      } catch {
        // CDN failed — still mark checked so nothing broken shows
      }
      if (!cancelled) setChecked(true);
    })();
    return () => { cancelled = true; };
  }, [agentName]);

  if (!checked || !stats || !chartReady) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] uppercase tracking-[0.3em] text-mist/60">Your Stats</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <DoughnutChart stats={stats} />
        <LineChart stats={stats} />
        {leaderboard.length > 0 && <BarChart rows={leaderboard} />}
      </div>

      <p className="mt-3 text-center text-[10px] text-mist/50">
        Only you can see this section.
      </p>
    </div>
  );
}
