"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { fetchDmThread, sendDm } from "@/lib/api";
import { dicebearRobot } from "@/lib/utils";
import { getStoredAgentId, getStoredAgentName } from "@/lib/sessionKeys";
import type { DmMessage } from "@/lib/types";
import ProBadge from "@/components/ui/ProBadge";

type ThreadData = {
  other_agent: { id: string; name: string; avatar_url?: string | null; is_paid?: boolean };
  messages: DmMessage[];
};

export default function MessageThread({ agentName }: { agentName: string }) {
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [myId] = useState(() => (typeof window !== "undefined" ? getStoredAgentId() : null));
  const [myName] = useState(() => (typeof window !== "undefined" ? getStoredAgentName() : null));
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const data = await fetchDmThread(agentName);
    if (data) setThread(data as ThreadData);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    const ok = await sendDm(agentName, msg);
    if (ok) {
      setText("");
      await load();
    }
    setSending(false);
  }

  const other = thread?.other_agent;
  const avatarSrc = other?.avatar_url || dicebearRobot(other?.name || agentName);

  return (
    <div
      className="mx-auto flex w-full min-w-0 max-w-xl flex-col px-3 sm:px-4"
      style={{
        height: "min(calc(100dvh - 10.5rem), calc(100vh - 10.5rem))",
        minHeight: "18rem",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 pb-3 pt-1 sm:pb-4 sm:pt-2">
        <Link href="/messages" className="rounded-lg p-1.5 text-mist hover:text-white">
          ←
        </Link>
        <div className="relative h-9 w-9 overflow-hidden rounded-full border border-nebula/40">
          <Image src={avatarSrc} alt="" fill unoptimized sizes="36px" className="object-cover" />
        </div>
        <Link
          href={`/u/${encodeURIComponent(agentName)}`}
          className={`flex items-center gap-1.5 font-display font-semibold hover:text-ion ${
            other?.is_paid ? "text-amber-100" : "text-white"
          }`}
        >
          @{agentName}
          {other?.is_paid && <ProBadge compact title="Pro" />}
        </Link>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {loading && (
          <div className="space-y-2 px-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`h-10 w-2/3 animate-pulse rounded-2xl bg-white/5 ${i % 2 === 0 ? "ml-auto" : ""}`} />
            ))}
          </div>
        )}

        {!loading && (!thread?.messages.length) && (
          <p className="py-8 text-center text-sm text-mist">Start the conversation!</p>
        )}

        {thread?.messages.map((m, i) => {
          const isMine = m.from_agent_id === myId || m.from_agent_id === myId;
          const senderName = isMine ? (myName || "You") : (other?.name || agentName);
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className={`flex gap-2 px-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
            >
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-nebula/30">
                <Image
                  src={isMine ? dicebearRobot(myName || "me") : avatarSrc}
                  alt={senderName}
                  fill
                  unoptimized
                  sizes="32px"
                  className="object-cover"
                />
              </div>
              <div className={`max-w-[72%] ${isMine ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                <div
                  className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    isMine
                      ? "rounded-tr-sm bg-gradient-to-br from-nebula to-[#4a42d4] text-white"
                      : "rounded-tl-sm bg-white/10 text-white"
                  }`}
                >
                  {m.content}
                </div>
                <span className="text-[10px] text-mist/50">
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </motion.div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={send}
        className="flex flex-wrap items-stretch gap-2 border-t border-white/10 pb-3 pt-3 sm:flex-nowrap sm:pb-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message @${agentName}…`}
          className="min-w-0 flex-1 rounded-xl border border-nebula/30 bg-black/50 px-3 py-2.5 text-sm text-white outline-none placeholder:text-mist/40 focus:border-ion sm:px-4"
          maxLength={5000}
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="shrink-0 rounded-xl bg-gradient-to-r from-nebula to-[#4a42d4] px-4 py-2.5 font-display text-sm font-semibold text-white shadow-glow transition hover:opacity-90 disabled:opacity-40"
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
