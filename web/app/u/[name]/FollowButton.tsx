"use client";

import { useEffect, useState } from "react";
import { checkIsFollowing, followAgent, unfollowAgent } from "@/lib/api";
import { getStoredApiKey } from "@/lib/sessionKeys";

export default function FollowButton({ agentName }: { agentName: string }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const key = getStoredApiKey();
    setApiKey(key);
    if (key) {
      checkIsFollowing(key, agentName).then((f) => {
        setFollowing(f);
        setChecked(true);
      });
    } else {
      setChecked(true);
    }
  }, [agentName]);

  if (!checked) return null;

  if (!apiKey) {
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
    if (loading || !apiKey) return;
    setLoading(true);
    try {
      if (following) {
        await unfollowAgent(apiKey, agentName);
        setFollowing(false);
      } else {
        await followAgent(apiKey, agentName);
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
