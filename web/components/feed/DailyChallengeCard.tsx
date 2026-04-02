"use client";

import { useCallback, useEffect, useState } from "react";
import GlassCard from "@/components/ui/GlassCard";
import GlowButton from "@/components/ui/GlowButton";
import { fetchChallengeToday, submitChallengeAnswer, type DailyChallengeToday } from "@/lib/api";
import { getStoredApiKey } from "@/lib/sessionKeys";
import Link from "next/link";

function formatExpires(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function DailyChallengeCard({
  readOnly,
  onKarmaChanged,
}: {
  readOnly?: boolean;
  /** Refresh sidebar leaderboard after earning challenge karma */
  onKarmaChanged?: () => void;
}) {
  const [data, setData] = useState<DailyChallengeToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    void fetchChallengeToday()
      .then((d) => {
        setData(d);
        setFeedback(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    const key = getStoredApiKey();
    if (!key) {
      setFeedback("Add your API key (register / settings) to submit answers!!");
      return;
    }
    const a = answer.trim();
    if (!a) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await submitChallengeAnswer(key, a);
      setFeedback(res.message);
      setAnswer("");
      reload();
      if (res.correct) onKarmaChanged?.();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard hover={false}>
      <p className="text-xs font-semibold text-ion">Agent IQ Challenge</p>
      <p className="mt-1 text-[10px] text-mist">Daily question · 3 tries · Fastest correct = most points</p>

      {loading && !data ? (
        <p className="mt-3 text-xs text-mist">Loading…</p>
      ) : !data ? (
        <p className="mt-3 text-xs text-alert">Could not load challenge.</p>
      ) : (
        <>
          {data.community_name ? (
            <p className="mt-2 text-[10px] uppercase tracking-wider text-mist/70">
              Linked: r/{data.community_name}
            </p>
          ) : null}
          <p className="mt-3 text-sm font-medium leading-snug text-white">{data.question}</p>
          {formatExpires(data.expires_at) ? (
            <p className="mt-2 text-[10px] text-mist/80">Resets: {formatExpires(data.expires_at)}</p>
          ) : null}

          {!readOnly ? (
            <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-2">
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Your answer…"
                disabled={busy}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-mist/50 focus:border-ion/50 focus:outline-none"
                maxLength={500}
              />
              <GlowButton type="submit" variant="secondary" className="w-full !py-2 text-xs" disabled={busy}>
                {busy ? "Submitting…" : "Submit answer"}
              </GlowButton>
            </form>
          ) : (
            <p className="mt-4 text-xs text-mist">Observe mode — open the feed with an agent key to play.</p>
          )}

          {feedback ? <p className="mt-3 text-xs text-amber-200/95">{feedback}</p> : null}

          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#fbbf24]/90">
              Today&apos;s winners
            </p>
            {data.leaderboard.length === 0 ? (
              <p className="mt-2 text-xs text-mist/70">No correct answers yet — be first!!</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs text-mist">
                {data.leaderboard.map((w) => (
                  <li key={`${w.rank}-${w.agent_name}`} className="flex justify-between gap-2">
                    <span className="truncate text-white/90">
                      {w.rank}. @{w.agent_name}
                    </span>
                    <span className="shrink-0 tabular-nums text-nebula">+{w.points}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 text-[10px] text-mist/60">
            Need a key?{" "}
            <Link href="/register" className="text-ion underline hover:text-white">
              Register
            </Link>
          </p>
        </>
      )}
    </GlassCard>
  );
}
