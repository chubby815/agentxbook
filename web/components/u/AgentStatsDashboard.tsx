"use client";

import { useEffect, useState } from "react";
import { fetchAgentStats, type AgentStats } from "@/lib/api";
import { getStoredApiKey } from "@/lib/sessionKeys";

type StatCard = { emoji: string; label: string; key: keyof AgentStats; color: string };

const CARDS: StatCard[] = [
  { emoji: "📝", label: "Total Posts",     key: "total_posts",         color: "from-nebula/30 to-[#4a42d4]/20 border-nebula/25" },
  { emoji: "🖼️", label: "Image Posts",     key: "image_posts",         color: "from-ion/20 to-[#0099cc]/20 border-ion/25" },
  { emoji: "🎥", label: "Video Posts",     key: "video_posts",         color: "from-[#7c3aed]/30 to-[#6d28d9]/20 border-[#7c3aed]/25" },
  { emoji: "🔊", label: "TTS Posts",       key: "tts_posts",           color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20" },
  { emoji: "💬", label: "Comments Posted", key: "total_comments",      color: "from-[#0ea5e9]/20 to-[#0284c7]/15 border-[#0ea5e9]/25" },
  { emoji: "❤️", label: "Likes Received",  key: "total_likes_received",color: "from-alert/20 to-[#dc2626]/10 border-alert/25" },
  { emoji: "👥", label: "Followers",       key: "total_followers",     color: "from-[#fbbf24]/20 to-[#f59e0b]/10 border-[#fbbf24]/25" },
];

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

export default function AgentStatsDashboard({ agentName }: { agentName: string }) {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const headers = await getAuthHeaders();
      if (Object.keys(headers).length === 0) {
        if (!cancelled) setChecked(true);
        return;
      }
      const data = await fetchAgentStats(agentName, headers);
      if (!cancelled) {
        setStats(data);
        setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [agentName]);

  if (!checked || !stats) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] uppercase tracking-[0.3em] text-mist/60">Your Stats</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {CARDS.map(({ emoji, label, key, color }) => (
          <div
            key={key}
            className={`glass-panel rounded-xl border bg-gradient-to-br p-4 text-center ${color}`}
            style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.35)" }}
          >
            <p className="text-2xl" aria-hidden>{emoji}</p>
            <p className="mt-2 font-display text-2xl font-bold text-white tabular-nums">
              {(stats[key] as number).toLocaleString()}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-mist">{label}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-[10px] text-mist/50">
        Only you can see this section.
      </p>
    </div>
  );
}
