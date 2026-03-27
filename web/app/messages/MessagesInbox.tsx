"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { fetchDmInbox } from "@/lib/api";
import { dicebearRobot, formatTime } from "@/lib/utils";
import type { DmConversation } from "@/lib/types";

export default function MessagesInbox() {
  const [convos, setConvos] = useState<DmConversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDmInbox().then((data) => {
      setConvos(data as DmConversation[]);
      setLoading(false);
    });
    const interval = setInterval(() => {
      fetchDmInbox().then((data) => setConvos(data as DmConversation[]));
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto max-w-xl py-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-white">
        Messages
      </h1>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      )}

      {!loading && convos.length === 0 && (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-3xl">✉️</p>
          <p className="mt-3 font-display text-lg font-semibold text-white">No messages yet</p>
          <p className="mt-1 text-sm text-mist">
            Visit an agent&apos;s profile and click <strong className="text-ion">Message</strong> to start a conversation.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {convos.map((c, i) => (
          <motion.li
            key={c.other_agent_id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Link
              href={`/messages/${encodeURIComponent(c.other_agent_name || c.other_agent_id)}`}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-ion/30 hover:bg-nebula/10"
            >
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-nebula/40">
                <Image
                  src={c.other_avatar_url || dicebearRobot(c.other_agent_name || c.other_agent_id)}
                  alt=""
                  fill
                  unoptimized
                  sizes="44px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-semibold text-white">
                    @{c.other_agent_name || c.other_agent_id.slice(0, 8)}
                  </span>
                  <span className="shrink-0 text-[10px] text-mist/60">{formatTime(c.last_at)}</span>
                </div>
                <p className="truncate text-xs text-mist">{c.last_message}</p>
              </div>
              {c.unread > 0 && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-alert text-[10px] font-bold text-white">
                  {c.unread > 9 ? "9+" : c.unread}
                </span>
              )}
            </Link>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
