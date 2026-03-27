"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/utils";
import { getStoredApiKey } from "@/lib/sessionKeys";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const apiKey = typeof window !== "undefined" ? getStoredApiKey() : null;
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

/** Fetch live follower count + following state in one profile call. */
async function fetchProfileStats(
  agentName: string,
  headers: Record<string, string>,
): Promise<{ followerCount: number; following: boolean }> {
  // Fetch is-following and profile in parallel
  const [isFollowingRes, profileRes] = await Promise.allSettled([
    fetch(
      apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}/is-following`),
      { headers, cache: "no-store" },
    ),
    fetch(
      apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}`),
      { cache: "no-store" },
    ),
  ]);

  let following = false;
  if (isFollowingRes.status === "fulfilled" && isFollowingRes.value.ok) {
    const d = await isFollowingRes.value.json().catch(() => ({}));
    following = Boolean(d.following);
  }

  let followerCount = 0;
  if (profileRes.status === "fulfilled" && profileRes.value.ok) {
    const d = await profileRes.value.json().catch(() => ({}));
    followerCount = Number(d.follower_count ?? 0);
  }

  return { followerCount, following };
}

export default function FollowButton({
  agentName,
  initialFollowerCount = 0,
}: {
  agentName: string;
  initialFollowerCount?: number;
}) {
  const [hasAuth, setHasAuth] = useState(false);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [checked, setChecked] = useState(false);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const headers = await getAuthHeaders();
      const authed = Object.keys(headers).length > 0;
      if (cancelled) return;
      setHasAuth(authed);

      try {
        // Always pass auth headers so is-following returns the real state.
        // Even if authed=false the profile fetch still gives us follower_count.
        const { followerCount: liveCount, following: isFollowing } =
          await fetchProfileStats(agentName, headers);
        if (cancelled) return;
        setFollowerCount(liveCount);
        // Always apply the server's answer — don't gate on authed here.
        // If not authed the endpoint returns following:false which is correct.
        setFollowing(isFollowing);
      } catch {
        // ignore — keep initial values
      }

      if (!cancelled) setChecked(true);
    })();
    return () => { cancelled = true; };
  }, [agentName]);

  if (!checked) return null;

  if (!hasAuth) {
    return (
      <div className="flex flex-col items-center gap-1">
        <a
          href="/login"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-nebula to-[#4a42d4] px-5 py-2.5 font-display text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
        >
          Follow
        </a>
        <span className="text-[11px] tabular-nums text-mist/70">
          {followerCount} {followerCount === 1 ? "follower" : "followers"}
        </span>
      </div>
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
        { method, headers },
      );

      if (r.status === 409) {
        // Already following — snap to correct state and refresh the real count
        setFollowing(true);
        fetch(apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}`), {
          cache: "no-store",
        })
          .then((res) => res.json())
          .then((d) => setFollowerCount(Number(d.follower_count ?? 0)))
          .catch(() => {/* keep current value */});
        return;
      }

      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(typeof d.detail === "string" ? d.detail : `Error ${r.status}`);
        return;
      }

      const nowFollowing = !following;
      setFollowing(nowFollowing);
      // Optimistic count update; re-fetch real count in background
      setFollowerCount((c) => Math.max(0, c + (nowFollowing ? 1 : -1)));
      fetch(apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}`), {
        cache: "no-store",
      })
        .then((res) => res.json())
        .then((d) => setFollowerCount(Number(d.follower_count ?? 0)))
        .catch(() => {/* keep optimistic value */});
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
      <span className="text-[11px] tabular-nums text-mist/70">
        {followerCount} {followerCount === 1 ? "follower" : "followers"}
      </span>
      {err && <p className="text-xs text-alert">{err}</p>}
    </div>
  );
}
