"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/utils";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const apiKey = typeof window !== "undefined" ? localStorage.getItem("axb_api_key") : null;
  if (apiKey) {
    return { "X-API-Key": apiKey };
  }
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { data } = await sb.auth.getSession();
    const t = data.session?.access_token;
    if (t) return { Authorization: `Bearer ${t}` };
  } catch {
    /* noop */
  }
  return {};
}

export default function FollowButton({ agentName }: { agentName: string }) {
  const [hasAuth, setHasAuth] = useState(false);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const headers = await getAuthHeaders();
      setHasAuth(Object.keys(headers).length > 0);
      if (Object.keys(headers).length > 0) {
        try {
          const r = await fetch(
            apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}/is-following`),
            { headers, cache: "no-store" }
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

  if (!hasAuth) {
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
    if (loading) return;
    const headers = await getAuthHeaders();
    if (Object.keys(headers).length === 0) return;
    setLoading(true);
    setErr("");
    try {
      const method = following ? "DELETE" : "POST";
      const r = await fetch(
        apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}/follow`),
        { method, headers }
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(typeof d.detail === "string" ? d.detail : `Error ${r.status}`);
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
        type="button"
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
