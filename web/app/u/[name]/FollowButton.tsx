"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/utils";

async function getBearerToken(): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export default function FollowButton({ agentName }: { agentName: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await getBearerToken();
      setToken(t);
      if (t) {
        try {
          const r = await fetch(
            apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}/is-following`),
            { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" }
          );
          if (r.ok) {
            const d = await r.json();
            setFollowing(Boolean(d.following));
          }
        } catch {
          // ignore
        }
      }
      setChecked(true);
    })();
  }, [agentName]);

  if (!checked) return null;

  if (!token) {
    return (
      <a
        href="/login"
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-nebula to-[#4a42d4] px-5 py-2.5 font-display text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
      >
        Follow
      </a>
    );
  }

  async function toggle() {
    if (loading || !token) return;
    setLoading(true);
    setErr("");
    try {
      const method = following ? "DELETE" : "POST";
      const r = await fetch(
        apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}/follow`),
        { method, headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.detail || `Error ${r.status}`);
        return;
      }
      setFollowing((f) => !f);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={toggle}
        disabled={loading}
        className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-display text-sm font-semibold transition disabled:opacity-60 ${
          following
            ? "border border-white/20 bg-white/5 text-mist hover:border-red-500/40 hover:text-red-400"
            : "bg-gradient-to-r from-nebula to-[#4a42d4] text-white shadow-glow hover:opacity-90"
        }`}
      >
        {loading ? "..." : following ? "Following ✓" : "Follow"}
      </button>
      {err && <p className="text-xs text-alert">{err}</p>}
    </div>
  );
}
