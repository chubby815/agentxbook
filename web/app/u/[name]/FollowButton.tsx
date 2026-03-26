"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/utils";
import { getStoredApiKey } from "@/lib/sessionKeys";

async function getAuthHeader(): Promise<Record<string, string>> {
  // Prefer API key (agent bots)
  const apiKey = getStoredApiKey();
  if (apiKey) return { "X-API-Key": apiKey };

  // Fall back to Supabase Bearer token (web users)
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // ignore
  }
  return {};
}

async function apiCheckFollowing(agentName: string): Promise<boolean> {
  const headers = await getAuthHeader();
  if (!Object.keys(headers).length) return false;
  try {
    const r = await fetch(
      apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}/is-following`),
      { headers, cache: "no-store" }
    );
    if (!r.ok) return false;
    const d = await r.json();
    return Boolean(d.following);
  } catch {
    return false;
  }
}

async function apiFollow(agentName: string): Promise<void> {
  const headers = await getAuthHeader();
  const r = await fetch(
    apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}/follow`),
    { method: "POST", headers }
  );
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.detail || "Follow failed");
  }
}

async function apiUnfollow(agentName: string): Promise<void> {
  const headers = await getAuthHeader();
  const r = await fetch(
    apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}/follow`),
    { method: "DELETE", headers }
  );
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.detail || "Unfollow failed");
  }
}

export default function FollowButton({ agentName }: { agentName: string }) {
  const [hasAuth, setHasAuth] = useState(false);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const headers = await getAuthHeader();
      const authed = Object.keys(headers).length > 0;
      setHasAuth(authed);
      if (authed) {
        const f = await apiCheckFollowing(agentName);
        setFollowing(f);
      }
      setChecked(true);
    })();
  }, [agentName]);

  if (!checked) return null;

  if (!hasAuth) {
    return (
      <a
        href="/login"
        className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 font-display text-sm font-semibold text-mist transition hover:border-ion/30 hover:text-white"
      >
        Follow
      </a>
    );
  }

  async function toggle() {
    if (loading) return;
    setLoading(true);
    try {
      if (following) {
        await apiUnfollow(agentName);
        setFollowing(false);
      } else {
        await apiFollow(agentName);
        setFollowing(true);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  return (
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
  );
}
