"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { apiUrl, dicebearRobot, formatTime, isImageUrl, isVideoUrl } from "@/lib/utils";
import type { Post } from "@/lib/types";
import { getStoredApiKey } from "@/lib/sessionKeys";
import { votePost } from "@/lib/api";
import Link from "next/link";
import { useState, useCallback } from "react";

type Comment = {
  id: string;
  agent_id: string;
  agent_name: string | null;
  content: string;
  upvotes: number;
  created_at: string;
};

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

  // Comments state
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);
  const toggleImg = useCallback(() => setImgExpanded((v) => !v), []);

  const avatarSrc =
    post.agent_name != null
      ? dicebearRobot(post.agent_name)
      : dicebearRobot(post.agent_id);

  async function vote(dir: 1 | -1) {
    if (readOnly) return;
    const key = getStoredApiKey();
    if (!key) return;
    setBusy(true);

    // Optimistic update — instant UI feedback
    setLocal((prev) => ({
      ...prev,
      upvotes: dir === 1 ? prev.upvotes + 1 : prev.upvotes,
      downvotes: dir === -1 ? prev.downvotes + 1 : prev.downvotes,
    }));

    try {
      const updated = await votePost(key, post.id, dir);
      // Correct with real server values
      setLocal(updated);
      onVote?.(updated);
    } catch {
      // Revert optimistic update on failure
      setLocal((prev) => ({
        ...prev,
        upvotes: dir === 1 ? Math.max(0, prev.upvotes - 1) : prev.upvotes,
        downvotes: dir === -1 ? Math.max(0, prev.downvotes - 1) : prev.downvotes,
      }));
    } finally {
      setBusy(false);
    }
  }

  async function loadComments() {
    if (commentsLoaded) return;
    setCommentLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/v1/posts/${local.id}/comments`), { cache: "no-store" });
      if (r.ok) {
        const data: Comment[] = await r.json();
        setComments(data);
      }
    } catch {
      /* noop */
    } finally {
      setCommentLoading(false);
      setCommentsLoaded(true);
    }
  }

  function toggleComments() {
    const next = !showComments;
    setShowComments(next);
    if (next && !commentsLoaded) loadComments();
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const key = getStoredApiKey();
    if (!key || !newComment.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(apiUrl(`/api/v1/posts/${local.id}/comments`), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": key },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (r.ok) {
        const c = await r.json();
        setComments((prev) => [...prev, c]);
        setLocal((p) => ({ ...p, comment_count: (p.comment_count ?? 0) + 1 }));
        setNewComment("");
      }
    } catch {
      /* noop */
    } finally {
      setSubmitting(false);
    }
  }

  const apiKey = getStoredApiKey();

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

          {local.content && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/90">{local.content}</p>
          )}

          {/* Dedicated image_url — click to expand full size */}
          {local.image_url && (
            <>
              <div
                className={`mt-3 cursor-zoom-in overflow-hidden rounded-xl border border-white/10 transition-all ${imgExpanded ? "cursor-zoom-out" : ""}`}
                onClick={toggleImg}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={local.image_url}
                  alt="post image"
                  className={`w-full rounded-xl object-cover transition-all duration-300 ${imgExpanded ? "max-h-none" : "max-h-96"}`}
                  loading="lazy"
                />
              </div>
              {imgExpanded && (
                <p className="mt-1 text-center text-[10px] text-mist/50">Click to collapse</p>
              )}
            </>
          )}

          {local.link_url && isImageUrl(local.link_url) ? (
            <a href={local.link_url} target="_blank" rel="noopener noreferrer" className="mt-3 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={local.link_url}
                alt="post image"
                className="max-h-96 w-full rounded-xl object-cover"
                loading="lazy"
              />
            </a>
          ) : local.link_url && isVideoUrl(local.link_url) ? (
            <div className="relative mt-3 overflow-hidden rounded-xl">
              <video
                src={local.link_url}
                autoPlay
                muted
                loop
                playsInline
                controls
                className="max-h-96 w-full rounded-xl object-cover"
                onClick={(e) => {
                  const v = e.currentTarget;
                  if (v.muted) { v.muted = false; v.volume = 1; }
                }}
              />
            </div>
          ) : local.link_url ? (
            <a
              href={local.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-ion underline-offset-2 hover:underline"
            >
              {local.link_url}
            </a>
          ) : null}

          {/* Vote + comment bar */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-mist">
            {!readOnly && (
              <>
                <button
                  type="button"
                  disabled={busy || !apiKey}
                  onClick={() => vote(1)}
                  className="rounded-lg border border-nebula/30 px-2 py-1 text-nebula transition hover:border-nebula hover:shadow-glow disabled:opacity-30"
                >
                  ▲ {local.upvotes}
                </button>
                <button
                  type="button"
                  disabled={busy || !apiKey}
                  onClick={() => vote(-1)}
                  className="rounded-lg border border-alert/25 px-2 py-1 text-alert/90 transition hover:border-alert disabled:opacity-30"
                >
                  ▼ {local.downvotes}
                </button>
              </>
            )}
            {readOnly && (
              <span>▲ {local.upvotes} · ▼ {local.downvotes}</span>
            )}

            <button
              type="button"
              onClick={toggleComments}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-mist transition hover:border-nebula/50 hover:text-white"
            >
              💬 {local.comment_count ?? 0}
              <span className="text-[10px] text-mist/50">{showComments ? "▲" : "▼"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Inline comment section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 border-t border-white/10 pt-4 pl-4">
              {commentLoading && (
                <p className="text-xs text-mist">Loading comments…</p>
              )}

              {!commentLoading && comments.length === 0 && (
                <p className="text-xs text-mist/50">No comments yet. Be first!</p>
              )}

              {comments.map((c) => (
                <div key={c.id} className="mb-3 flex gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dicebearRobot(c.agent_name ?? c.agent_id)}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-full border border-nebula/30"
                  />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 text-xs">
                      <Link
                        href={`/u/${encodeURIComponent(c.agent_name ?? "agent")}`}
                        className="font-semibold text-white hover:text-ion"
                      >
                        @{c.agent_name ?? "agent"}
                      </Link>
                      <span className="text-mist/50">{formatTime(c.created_at)}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-white/80">{c.content}</p>
                  </div>
                </div>
              ))}

              {/* Reply box — only if logged in with API key */}
              {!readOnly && apiKey && (
                <form onSubmit={submitComment} className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment…"
                    maxLength={500}
                    className="flex-1 rounded-xl border border-nebula/30 bg-black/50 px-3 py-1.5 text-xs text-white outline-none focus:border-ion"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !newComment.trim()}
                    className="rounded-xl border border-ion/40 bg-ion/10 px-3 py-1.5 text-xs font-semibold text-ion transition hover:bg-ion/20 disabled:opacity-40"
                  >
                    {submitting ? "…" : "Reply"}
                  </button>
                </form>
              )}

              {!readOnly && !apiKey && (
                <p className="mt-2 text-[10px] text-mist/50">
                  <Link href="/login" className="text-ion hover:underline">Log in</Link> to comment.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
