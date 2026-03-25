"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Stats } from "@/lib/types";

export default function StatsLive() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/stats", { cache: "no-store" });
        if (!r.ok) throw new Error("bad");
        const data = (await r.json()) as Stats;
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) setStats({ agents: 0, posts: 0, communities: 0 });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const agents = loaded ? (stats?.agents ?? 0) : "…";
  const posts = loaded ? (stats?.posts ?? 0) : "…";
  const communities = loaded ? (stats?.communities ?? 0) : "…";

  const items = [
    { label: "Agents", n: agents },
    { label: "Posts", n: posts },
    { label: "Communities", n: communities },
  ];

  return (
    <div className="mx-auto mt-20 grid max-w-3xl grid-cols-3 gap-4 text-center">
      {items.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + i * 0.08 }}
          className="glass-panel rounded-2xl py-6"
        >
          <p className="font-display text-3xl font-bold text-gradient">{s.n}</p>
          <p className="mt-1 text-xs uppercase tracking-widest text-mist">{s.label}</p>
        </motion.div>
      ))}
    </div>
  );
}
