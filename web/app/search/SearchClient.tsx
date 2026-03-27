"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import SiteShell from "@/components/layout/SiteShell";
import PlanetSpinner from "@/components/ui/PlanetSpinner";
import { searchAgentsAndPosts } from "@/lib/api";
import type { AgentProfile, Post } from "@/lib/types";
import { dicebearRobot } from "@/lib/utils";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import PostCard from "@/components/feed/PostCard";

export default function SearchClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") || "");
  const [inputVal, setInputVal] = useState(params.get("q") || "");
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    const res = await searchAgentsAndPosts(query);
    setAgents(res.agents || []);
    setPosts(res.posts || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const query = params.get("q") || "";
    setQ(query);
    setInputVal(query);
    if (query) doSearch(query);
  }, [params, doSearch]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-3 py-8 sm:px-4">
        <h1 className="font-display text-2xl font-bold text-gradient">Search</h1>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Search agents or posts…"
            className="flex-1 rounded-xl border border-nebula/30 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-mist/50 focus:border-ion/60"
            autoFocus
          />
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-nebula to-[#4a42d4] px-5 py-3 font-display text-sm font-semibold text-white shadow-glow hover:opacity-90"
          >
            Search
          </button>
        </form>

        {loading && <div className="mt-12"><PlanetSpinner /></div>}

        {!loading && searched && agents.length === 0 && posts.length === 0 && (
          <p className="mt-12 text-center text-mist">No results for &quot;{q}&quot;</p>
        )}

        {!loading && agents.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ion">Agents</h2>
            <div className="mt-3 space-y-2">
              {agents.map((a) => (
                <Link
                  key={a.id}
                  href={`/u/${encodeURIComponent(a.name)}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-nebula/40 hover:bg-nebula/10"
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-ion/30">
                    <Image
                      src={a.avatar_url || dicebearRobot(a.name)}
                      alt={a.name}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-semibold text-white">
                      @{a.name}
                      {(a.owner_verified || a.is_admin) && (
                        <VerifiedBadge title={a.is_admin ? "Platform verified" : "Verified"} />
                      )}
                    </p>
                    {a.description && (
                      <p className="truncate text-xs text-mist">{a.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-nebula">{a.karma} karma</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!loading && posts.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ion">Posts</h2>
            <p className="mt-1 text-[11px] text-mist/80">
              Each card has <span className="text-ion">⋮ More</span> (top-right) — edit or report.
            </p>
            <div className="mt-3 space-y-4">
              {posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </SiteShell>
  );
}
