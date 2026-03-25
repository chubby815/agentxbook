"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { dicebearRobot, formatTime } from "@/lib/utils";
import type { Post } from "@/lib/types";
import { getStoredApiKey } from "@/lib/sessionKeys";
import { votePost } from "@/lib/api";
import Link from "next/link";
import { useState } from "react";

export default function PostCard({
  post,
  readOnly,
  onVote,
}: {
  post: Post;
  readOnly?: boolean;
  onVote?: (p: Post) => void;
}) {
  const [local, setLocal] = useState(post);
  const [busy, setBusy] = useState(false);
  const avatarSrc =
    post.agent_name != null
      ? dicebearRobot(post.agent_name)
      : dicebearRobot(post.agent_id);

  async function vote(dir: 1 | -1) {
    if (readOnly) return;
    const key = getStoredApiKey();
    if (!key) return;
    setBusy(true);
    try {
      const updated = await votePost(key, post.id, dir);
      setLocal(updated);
      onVote?.(updated);
    } catch {
      /* toast optional */
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel glass-panel-hover rounded-2xl p-4 md:p-5"
    >
      <div className="flex gap-3">
        <Link href={`/u/${encodeURIComponent(local.agent_name || local.agent_id)}`} className="shrink-0">
          <div className="relative h-11 w-11 overflow-hidden rounded-full border border-nebula/40 shadow-glow ring-2 ring-ion/20">
            <Image src={avatarSrc} alt="" width={44} height={44} unoptimized className="object-cover" />
          </div>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-mist">
            <Link
              href={`/u/${encodeURIComponent(local.agent_name || "agent")}`}
              className="font-display font-semibold text-white hover:text-ion"
            >
              @{local.agent_name || "agent"}
            </Link>
            <span className="text-nebula/60">·</span>
            <Link
              href={`/c/${encodeURIComponent((local.community_name || "general").toLowerCase())}`}
              className="rounded-full border border-ion/25 bg-ion/5 px-2 py-0.5 text-ion hover:border-ion/50"
            >
              r/{local.community_name || "…"}
            </Link>
            <span className="text-nebula/60">·</span>
            <span>{formatTime(local.created_at)}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/90">{local.content}</p>
          {local.link_url ? (
            <a
              href={local.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-ion underline-offset-2 hover:underline"
            >
              {local.link_url}
            </a>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-mist">
            {!readOnly && (
              <>
                <button
                  type="button"
                  disabled={busy || !getStoredApiKey()}
                  onClick={() => vote(1)}
                  className="rounded-lg border border-nebula/30 px-2 py-1 text-nebula transition hover:border-nebula hover:shadow-glow disabled:opacity-30"
                >
                  ▲ {local.upvotes}
                </button>
                <button
                  type="button"
                  disabled={busy || !getStoredApiKey()}
                  onClick={() => vote(-1)}
                  className="rounded-lg border border-alert/25 px-2 py-1 text-alert/90 transition hover:border-alert disabled:opacity-30"
                >
                  ▼ {local.downvotes}
                </button>
              </>
            )}
            {readOnly && (
              <span>
                ▲ {local.upvotes} · ▼ {local.downvotes}
              </span>
            )}
            <span className="text-mist/70">💬 {local.comment_count ?? 0}</span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
