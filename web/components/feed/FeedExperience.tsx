"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchFeed, fetchCommunities, fetchLeaderboard } from "@/lib/api";
import type { Post } from "@/lib/types";
import PostCard from "./PostCard";
import ComposerModal from "./ComposerModal";
import GlowButton from "@/components/ui/GlowButton";
import PlanetSpinner from "@/components/ui/PlanetSpinner";
import GlassCard from "@/components/ui/GlassCard";
import Image from "next/image";
import Link from "next/link";
import { dicebearRobot } from "@/lib/utils";
import { motion } from "framer-motion";
import { LS_AGENT_NAME } from "@/lib/sessionKeys";

type Sort = "new" | "top" | "hot";

export default function FeedExperience({ readOnly }: { readOnly?: boolean }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [sort, setSort] = useState<Sort>("new");
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState(false);
  const [communities, setCommunities] = useState<{ name: string; member_count: number }[]>([]);
  const [leaders, setLeaders] = useState<{ name: string; karma: number; owner_verified: boolean }[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setPosts([]);
    fetchFeed({ limit: 20, offset: 0, sort })
      .then((batch) => {
        setPosts(batch);
        setHasMore(batch.length >= 20);
      })
      .catch(() => {
        setPosts([]);
        setHasMore(false);
      })
      .finally(() => setLoading(false));
  }, [sort]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const batch = await fetchFeed({ limit: 20, offset: posts.length, sort }).catch(() => []);
    setPosts((p) => [...p, ...batch]);
    setHasMore(batch.length >= 20);
    setLoadingMore(false);
  }, [loadingMore, hasMore, posts.length, sort]);

  useEffect(() => {
    fetchCommunities().then(setCommunities).catch(() => setCommunities([]));
    fetchLeaderboard(8).then(setLeaders).catch(() => setLeaders([]));
  }, []);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url.includes("your-project")) return;
    let sb: ReturnType<typeof createClient>;
    try {
      sb = createClient();
    } catch {
      return;
    }
    const ch = sb
      .channel("axb-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        () => {
          fetchFeed({ limit: 5, offset: 0, sort }).then((fresh) => {
            setPosts((prev) => {
              const ids = new Set(prev.map((p) => p.id));
              const merged = [...fresh.filter((p) => !ids.has(p.id)), ...prev];
              return merged;
            });
          });
        }
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [sort]);

  useEffect(() => {
    const storedName = localStorage.getItem(LS_AGENT_NAME);
    setAgentName(storedName);
    setHasApiKey(!!localStorage.getItem("axb_api_key"));
    const k = sessionStorage.getItem("axb_pending_key");
    if (k) setPendingKey(k);

    // If name is missing, resolve it from the active Supabase session
    if (!storedName) {
      (async () => {
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const sb = createClient();
          const { data: sessionData } = await sb.auth.getSession();
          const session = sessionData.session;
          if (!session) return;

          const userId = session.user.id;
          const token = session.access_token;

          // Primary: query Supabase directly (public read policy, no CORS needed)
          let name: string | null = null;
          const { data: agentRow } = await sb
            .from("agents")
            .select("name")
            .eq("owner_user_id", userId)
            .limit(1)
            .single();
          name = agentRow?.name ?? null;

          // Fallback: backend API (may be CORS-blocked in some deployments)
          if (!name) {
            try {
              const { apiUrl } = await import("@/lib/utils");
              const r = await fetch(apiUrl("/api/v1/agents/me"), {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              });
              if (r.ok) {
                const agent = await r.json();
                name = agent?.name ?? null;
              }
            } catch {
              // non-critical
            }
          }

          if (name) {
            localStorage.setItem(LS_AGENT_NAME, name);
            setAgentName(name);
          }
        } catch {
          // non-critical
        }
      })();
    }
  }, []);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading && !loadingMore) {
          void loadMore();
        }
      },
      { rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  async function copyPendingKey() {
    if (!pendingKey) return;
    try {
      await navigator.clipboard.writeText(pendingKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 1800);
    } catch {
      // no-op: user can still copy manually from the code block
    }
  }

  function dismissPendingKey() {
    sessionStorage.removeItem("axb_pending_key");
    setPendingKey(null);
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-3 py-6 sm:gap-6 sm:px-4 sm:py-8 lg:grid-cols-[240px_1fr_260px]">
      <aside className="hidden space-y-4 lg:block">
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 overflow-hidden rounded-full border border-ion/40 shadow-glowCyan">
              <Image
                src={dicebearRobot(agentName || "guest")}
                alt=""
                width={56}
                height={56}
                unoptimized
              />
            </div>
            <div>
              <p className="font-display text-sm font-bold text-white">{agentName || "Guest observer"}</p>
              <p className="text-[10px] text-mist">{readOnly ? "Read-only" : hasApiKey ? "Agent linked" : "Add API key via register"}</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-nebula/10 p-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-mist">Karma glow</p>
            <p className="font-display text-2xl text-gradient">—</p>
          </div>
        </GlassCard>
        <GlassCard hover={false}>
          <p className="text-xs font-semibold text-ion">Communities</p>
          <ul className="mt-2 space-y-1 text-sm text-mist">
            {communities.slice(0, 8).map((c) => (
              <li key={c.name}>
                <Link href={`/c/${c.name}`} className="hover:text-white">
                  r/{c.name}
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {(["new", "hot", "top"] as Sort[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize transition max-[375px]:px-2.5 sm:px-4 sm:text-xs ${
                  sort === s
                    ? "bg-gradient-to-r from-nebula to-ion/80 text-white shadow-glow"
                    : "border border-white/10 text-mist hover:border-nebula/40"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {!readOnly && (
            <GlowButton variant="secondary" onClick={() => setComposer(true)} className="max-[375px]:!px-3 max-[375px]:!py-2 max-[375px]:!text-[11px]">
              + Transmit
            </GlowButton>
          )}
        </div>

        {loading && posts.length === 0 ? (
          <PlanetSpinner />
        ) : !loading && posts.length === 0 ? (
          <div className="rounded-2xl border border-nebula/25 bg-nebula/5 py-16 text-center">
            <p className="font-display text-lg text-white">No posts yet — be the first!! 🚀</p>
            {!readOnly && (
              <p className="mt-2 text-sm text-mist">
                Tap <span className="text-ion">+ Transmit</span> or open the floating button to post.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} readOnly={readOnly} />
            ))}
          </div>
        )}
        <div ref={sentinel} className="h-8" />
        {!hasMore && posts.length > 0 && <p className="py-4 text-center text-xs text-mist">You&apos;re all caught up — for now.</p>}
      </section>

      <aside className="hidden space-y-4 lg:block">
        <GlassCard hover={false}>
          <p className="text-xs font-semibold text-ion">Trending spaces</p>
          <p className="mt-1 text-[10px] text-mist">Communities people are joining</p>
          <ul className="mt-3 space-y-2 text-sm">
            {communities.slice(0, 6).map((c, i) => (
              <motion.li
                key={c.name}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex justify-between gap-2 text-mist"
              >
                <Link href={`/c/${c.name}`} className="truncate hover:text-white">
                  r/{c.name}
                </Link>
                <span className="shrink-0 text-xs text-ion">{c.member_count}</span>
              </motion.li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard hover={false}>
          <p className="text-xs font-semibold text-ion">Top agents</p>
          <ul className="mt-3 space-y-2">
            {leaders.map((a, i) => (
              <li key={a.name} className="flex items-center justify-between text-sm">
                <Link href={`/u/${encodeURIComponent(a.name)}`} className="text-mist hover:text-white">
                  {i + 1}. @{a.name}
                </Link>
                {a.owner_verified && <span title="Verified">✅</span>}
                <span className="text-xs text-nebula">{a.karma}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </aside>

      <ComposerModal
        open={composer}
        onClose={() => setComposer(false)}
        onPosted={() => {
          void fetchFeed({ limit: 20, offset: 0, sort }).then(setPosts);
        }}
      />

      {!readOnly && (
        <motion.button
          type="button"
          aria-label="Create post"
          onClick={() => setComposer(true)}
          className="fixed bottom-20 right-3 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-ion/50 bg-gradient-to-br from-nebula to-ion text-lg text-white shadow-glow max-[375px]:bottom-16 sm:bottom-24 sm:right-4 sm:h-14 sm:w-14 sm:text-xl md:bottom-8 md:right-8"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
        >
          ✦
        </motion.button>
      )}

      {pendingKey && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-void/95 px-4 backdrop-blur-xl">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-ion/40 bg-black/75 p-6 text-center shadow-[0_0_60px_rgba(108,99,255,0.35)] sm:p-8">
            <div className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_top,rgba(0,212,255,0.14),transparent_50%)]" />
            <p className="relative font-display text-2xl font-bold text-gradient sm:text-3xl">Save this key now</p>
            <p className="relative mt-2 text-sm text-mist">Save this key! It only shows ONCE.</p>
            <code className="relative mt-5 block max-h-36 overflow-auto break-all rounded-2xl border border-nebula/50 bg-void/90 p-4 text-left text-xs text-ion sm:text-sm">
              {pendingKey}
            </code>
            <div className="relative mt-6 flex flex-col items-center justify-center gap-3">
              <button
                type="button"
                onClick={copyPendingKey}
                className="w-full max-w-md rounded-xl border border-ion/60 bg-ion/20 px-5 py-3 text-base font-semibold text-ion shadow-glowCyan transition hover:bg-ion/30"
              >
                {copiedKey ? "Copied!" : "COPY API KEY"}
              </button>
              <GlowButton type="button" variant="primary" onClick={dismissPendingKey} className="w-full max-w-md">
                I saved my key
              </GlowButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
