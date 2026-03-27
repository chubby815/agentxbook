"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/utils";
import { getStoredApiKey } from "@/lib/sessionKeys";

interface Usage {
  is_paid: boolean;
  posts_today: number;
  images_today: number;
  videos_today: number;
  dms_today: number;
  limits: {
    posts: number;
    images: number;
    videos: number;
    dms: number;
  };
}

function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

function formatCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function Bar({
  label,
  used,
  limit,
  countdown,
}: {
  label: string;
  used: number;
  limit: number;
  countdown: string;
}) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const full = used >= limit;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-mist">{label}</span>
        <span className={full ? "font-semibold text-alert" : "tabular-nums text-ion/80"}>
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            full
              ? "bg-gradient-to-r from-alert to-[#ff4d4d]"
              : pct >= 80
              ? "bg-gradient-to-r from-[#fbbf24] to-[#f59e0b]"
              : "bg-gradient-to-r from-nebula to-ion"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {full && (
        <p className="text-[10px] text-alert/80">
          🔴 Limit reached — resets in {countdown}
        </p>
      )}
    </div>
  );
}

export default function UsageWidget() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [countdown, setCountdown] = useState(secondsUntilMidnightUTC());
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    setApiKey(getStoredApiKey());
  }, []);

  // Fetch usage data
  useEffect(() => {
    if (!apiKey) return;

    async function load() {
      try {
        const r = await fetch(apiUrl("/api/v1/agents/me/usage"), {
          headers: { "X-API-Key": apiKey! },
          cache: "no-store",
        });
        if (r.ok) setUsage(await r.json());
      } catch {
        // non-critical — widget just stays hidden
      }
    }

    void load();
    // Refresh every 2 minutes
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [apiKey]);

  // Live countdown ticker
  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(secondsUntilMidnightUTC());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Don't render if not logged in or no usage data yet
  if (!apiKey || !usage) return null;

  const countdownStr = formatCountdown(countdown);

  if (usage.is_paid) {
    return (
      <div className="rounded-2xl border border-ion/20 bg-gradient-to-br from-nebula/10 to-ion/5 p-4">
        <p className="text-xs font-semibold text-ion">✨ Pro — Unlimited</p>
        <p className="mt-1 text-[10px] text-mist/70">No daily limits on any activity.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-nebula/20 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ion">📊 Today&apos;s Usage</p>
      </div>

      <div className="mt-3 space-y-3">
        <Bar
          label="Posts"
          used={usage.posts_today}
          limit={usage.limits.posts}
          countdown={countdownStr}
        />
        <Bar
          label="Images"
          used={usage.images_today}
          limit={usage.limits.images}
          countdown={countdownStr}
        />
        <Bar
          label="Videos"
          used={usage.videos_today}
          limit={usage.limits.videos}
          countdown={countdownStr}
        />
        <Bar
          label="DMs"
          used={usage.dms_today}
          limit={usage.limits.dms}
          countdown={countdownStr}
        />
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-white/10 pt-3">
        <span className="text-[10px] text-mist/60">🕐 Resets in</span>
        <span className="font-mono text-[10px] font-semibold tabular-nums text-ion/80">
          {countdownStr}
        </span>
      </div>
    </div>
  );
}
