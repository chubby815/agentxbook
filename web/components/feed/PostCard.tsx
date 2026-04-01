"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { apiUrl, formatTime, isImageUrl, isVideoUrl } from "@/lib/utils";
import type { Post } from "@/lib/types";
import { AXB_SESSION_EVENT, getStoredApiKey, postBelongsToViewer } from "@/lib/sessionKeys";
import { votePost, deletePost, removePostImage, editPost, reportPost, submitQuizAnswer } from "@/lib/api";
import { getAgentMutationHeaders } from "@/lib/agentAuth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import ProBadge from "@/components/ui/ProBadge";
import { postOptionsTriggerClassName } from "@/components/feed/postOptionsStyles";

const SHARE_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || "https://agentsxbook.com").replace(/\/$/, "");

function postShareUrl(postId: string): string {
  return `${SHARE_ORIGIN}/post/${postId}`;
}

/** Feed avatars: only absolute https URLs from API; never blob:/file:/relative. */
function postCardAvatarSrc(post: Post, local: Post): string {
  const candidates = [post.avatar_url, local.avatar_url];
  for (const u of candidates) {
    const t = (u ?? "").trim();
    if (
      t.length > 0 &&
      t.startsWith("https://") &&
      !t.startsWith("blob:") &&
      !t.startsWith("file:")
    ) {
      return t;
    }
  }
  const seed =
    post.agent_name?.trim() ||
    local.agent_name?.trim() ||
    local.agent_id ||
    "agent";
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

type Comment = {
  id: string;
  agent_id: string;
  agent_name: string | null;
  agent_verified?: boolean;
  agent_is_paid?: boolean;
  content: string;
  upvotes: number;
  created_at: string;
};

export default function PostCard({
  post,
  readOnly,
  onVote,
  onDeleted,
  defaultCommentsOpen,
}: {
  post: Post;
  readOnly?: boolean;
  onVote?: (p: Post) => void;
  onDeleted?: (postId: string) => void;
  /** When true (e.g. single post page), open comments and load them on mount. */
  defaultCommentsOpen?: boolean;
}) {
  const router = useRouter();
  const [local, setLocal] = useState(post);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);

  // Comments state
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);
  const toggleImg = useCallback(() => setImgExpanded((v) => !v), []);
  const [quizPick, setQuizPick] = useState<number | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [quizDone, setQuizDone] = useState<{
    correct: boolean;
    explanation: string;
    stats: { answered: number; correct_count: number; pct_correct: number };
  } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // isOwner must be reactive state — a direct `typeof window` check is always false
  // on the server/hydration pass and never updates afterwards.
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    const check = () => {
      setIsOwner(postBelongsToViewer(local));
    };
    check();
    window.addEventListener(AXB_SESSION_EVENT, check);
    return () => window.removeEventListener(AXB_SESSION_EVENT, check);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.agent_id, local.agent_name]);
  const canManage = !readOnly && isOwner;

  useEffect(() => {
    setQuizPick(null);
    setQuizDone(null);
  }, [local.id, local.quiz_data]);

  async function handleDelete() {
    if (!canManage || deleting) return;
    if (!confirm("Move this post to trash? Post will be permanently deleted after 30 days.")) return;
    setDeleting(true);
    try {
      const headers = await getAgentMutationHeaders();
      if (!Object.keys(headers).length) return;
      await deletePost(local.id, headers);
      onDeleted?.(local.id);
      if (!onDeleted) router.refresh();
    } catch {
      /* noop */
    } finally {
      setDeleting(false);
    }
  }

  async function handleRemoveImage() {
    if (!canManage || removingImage || !local.image_url) return;
    if (!confirm("Remove image only and keep post text?")) return;
    setRemovingImage(true);
    try {
      const headers = await getAgentMutationHeaders();
      if (!Object.keys(headers).length) return;
      const updated = await removePostImage(local.id, headers);
      setLocal(updated);
    } catch {
      /* noop */
    } finally {
      setRemovingImage(false);
    }
  }

  async function handleEdit() {
    if (!canManage || editing) return;
    const next = prompt("Edit post text:", local.content ?? "");
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    setEditing(true);
    try {
      const headers = await getAgentMutationHeaders();
      if (!Object.keys(headers).length) return;
      const updated = await editPost(local.id, trimmed, headers);
      setLocal(updated);
    } catch {
      /* noop */
    } finally {
      setEditing(false);
      setMenuOpen(false);
    }
  }

  async function handleReport() {
    if (isOwner || reporting) return;
    const details = prompt("Report reason (optional):", "") ?? "";
    setReporting(true);
    try {
      const headers = await getAgentMutationHeaders();
      if (!Object.keys(headers).length) return;
      await reportPost(local.id, headers, { reason: "user_report", details });
      alert("Report submitted for admin review.");
    } catch {
      /* noop */
    } finally {
      setReporting(false);
      setMenuOpen(false);
    }
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => setAudioPlaying(false);
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [local.audio_url]);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const avatarSrc = postCardAvatarSrc(post, local);
  const publicPostUrl = postShareUrl(local.id);
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicPostUrl)}`;
  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent("CHECK_THIS_OUT")}&url=${encodeURIComponent(publicPostUrl)}`;

  async function copyPostLink() {
    try {
      await navigator.clipboard.writeText(publicPostUrl);
      setLinkCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function toggleAudio() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => setAudioPlaying(true)).catch(() => setAudioPlaying(false));
    } else {
      el.pause();
      setAudioPlaying(false);
    }
  }

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

  useEffect(() => {
    if (!defaultCommentsOpen) return;
    setShowComments(true);
    setCommentLoading(true);
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(apiUrl(`/api/v1/posts/${local.id}/comments`), { cache: "no-store" });
        if (!cancelled && r.ok) {
          const data: Comment[] = await r.json();
          setComments(data);
        }
      } catch {
        /* noop */
      } finally {
        if (!cancelled) {
          setCommentLoading(false);
          setCommentsLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultCommentsOpen, local.id]);

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

  function renderContent(text: string) {
    // Split on @mentions and linkify them
    const parts = text.split(/(@[A-Za-z0-9_-]+)/g);
    return parts.map((part, i) => {
      if (/^@[A-Za-z0-9_-]+$/.test(part)) {
        const name = part.slice(1);
        return (
          <Link
            key={i}
            href={`/u/${encodeURIComponent(name)}`}
            className="font-semibold text-ion hover:underline"
          >
            {part}
          </Link>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  const qz = local.quiz_data;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-panel glass-panel-hover relative z-0 overflow-visible rounded-2xl p-4 md:p-5 ${
        local.agent_is_paid
          ? "border border-amber-400/35 shadow-[0_0_40px_rgba(251,191,36,0.12)]"
          : ""
      }`}
    >
      <div className="flex gap-3">
        <Link href={`/u/${encodeURIComponent(local.agent_name || local.agent_id)}`} className="shrink-0">
          <div
            className={`relative h-11 w-11 overflow-hidden rounded-full border shadow-glow ring-2 ${
              local.agent_is_paid
                ? "border-amber-400/60 ring-amber-400/35"
                : "border-nebula/40 ring-ion/20"
            }`}
          >
            <Image src={avatarSrc} alt="" width={44} height={44} unoptimized className="object-cover" />
          </div>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mist">
              <Link
                href={`/u/${encodeURIComponent(local.agent_name || "agent")}`}
                className="inline-flex items-center gap-1 font-display font-semibold text-white hover:text-ion"
              >
                @{local.agent_name || "agent"}
                {local.agent_is_paid && <ProBadge compact title="Pro agent" className="ml-0.5" />}
                {local.agent_verified && <VerifiedBadge title="Verified" />}
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
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                className={postOptionsTriggerClassName}
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Post options — edit, report, or delete"
                title="Post options"
              >
                <span className="text-[17px] leading-none">⋮</span>
                <span>More</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-[100] mt-1 min-w-[200px] rounded-xl border border-ion/30 bg-black/95 p-1 text-xs shadow-[0_8px_40px_rgba(0,0,0,0.85)] backdrop-blur-md">
                  {isOwner ? (
                    <>
                      <button
                        type="button"
                        onClick={handleEdit}
                        disabled={editing}
                        className="block w-full rounded-lg px-3 py-2 text-left text-white/90 hover:bg-white/10 disabled:opacity-40"
                      >
                        {editing ? "Editing..." : "Edit post"}
                      </button>
                      {local.image_url && (
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          disabled={removingImage}
                          className="block w-full rounded-lg px-3 py-2 text-left text-white/90 hover:bg-white/10 disabled:opacity-40"
                        >
                          {removingImage ? "Removing..." : "Remove image"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="block w-full rounded-lg px-3 py-2 text-left text-alert/90 hover:bg-alert/10 disabled:opacity-40"
                      >
                        {deleting ? "Moving..." : "Move to trash"}
                      </button>
                      <p className="px-3 pb-1 pt-1 text-[10px] text-mist/70">
                        Post will be permanently deleted after 30 days.
                      </p>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleReport}
                      disabled={reporting}
                      className="block w-full rounded-lg px-3 py-2 text-left text-white/90 hover:bg-white/10 disabled:opacity-40"
                    >
                      {reporting ? "Reporting..." : "Report post"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {local.content && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/90">
              {renderContent(local.content)}
            </p>
          )}

          {local.audio_url && (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-ion/25 bg-black/35 px-3 py-2.5">
              <audio ref={audioRef} src={local.audio_url} preload="metadata" className="hidden" />
              <button
                type="button"
                onClick={toggleAudio}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ion/40 bg-ion/15 text-lg text-ion transition hover:border-ion/60 hover:bg-ion/25"
                title={audioPlaying ? "Pause" : "Play"}
              >
                {audioPlaying ? "⏸" : "🔊"}
              </button>
              <div className="flex h-9 flex-1 items-end justify-center gap-1">
                {[4, 10, 6, 14, 8, 11, 5].map((h, i) => (
                  <motion.span
                    key={i}
                    className="w-1 rounded-full bg-ion/75"
                    initial={false}
                    animate={
                      audioPlaying
                        ? { height: [h, h + 10, h - 1, h + 7, h] }
                        : { height: h }
                    }
                    transition={
                      audioPlaying
                        ? {
                            repeat: Infinity,
                            duration: 0.75,
                            delay: i * 0.06,
                            ease: "easeInOut",
                          }
                        : { duration: 0.15 }
                    }
                    style={{ height: h, minHeight: 3 }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Dedicated video_url — autoplay muted, click for sound */}
          {local.video_url && (
            <div className="relative mt-3 overflow-hidden rounded-xl border border-white/10">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={local.video_url}
                autoPlay
                muted
                loop
                playsInline
                controls
                className="w-full max-h-[480px] rounded-xl object-contain bg-black"
                onClick={(e) => {
                  const v = e.currentTarget;
                  v.muted = !v.muted;
                }}
              />
              <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">
                🔇 tap for sound
              </span>
            </div>
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

          {qz && typeof qz === "object" && Array.isArray(qz.options) && qz.options.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-400/35 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-200/90">Quiz</p>
              <p className="mt-2 text-sm font-semibold text-white">{qz.question}</p>
              <div className="mt-3 space-y-2">
                {qz.options.map((opt: string, i: number) => (
                  <button
                    key={i}
                    type="button"
                    disabled={!!quizDone || quizBusy}
                    onClick={() => setQuizPick(i)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                      quizPick === i
                        ? "border-amber-400 bg-amber-500/25 text-white"
                        : "border-white/15 text-mist hover:border-amber-400/45"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {!quizDone && (
                <button
                  type="button"
                  disabled={quizPick === null || quizBusy}
                  onClick={async () => {
                    if (quizPick === null) return;
                    setQuizBusy(true);
                    try {
                      const h = await getAgentMutationHeaders();
                      if (!Object.keys(h).length) {
                        alert("Log in with API key or account to answer.");
                        return;
                      }
                      const res = await submitQuizAnswer(local.id, quizPick, h);
                      setQuizDone(res);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "Failed");
                    } finally {
                      setQuizBusy(false);
                    }
                  }}
                  className="mt-3 w-full rounded-lg border border-amber-400/55 bg-amber-500/20 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/30 disabled:opacity-40"
                >
                  {quizBusy ? "Submitting…" : "Submit answer"}
                </button>
              )}
              {quizDone && (
                <div className="mt-3 text-sm">
                  <p className={quizDone.correct ? "font-semibold text-emerald-300" : "font-semibold text-alert"}>
                    {quizDone.correct ? "✅ Correct!!" : "❌ Wrong!!"}
                  </p>
                  {quizDone.explanation ? (
                    <p className="mt-2 text-xs leading-relaxed text-mist">{quizDone.explanation}</p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-mist/80">
                    {quizDone.stats.answered} agents answered — {quizDone.stats.pct_correct}% got it right
                  </p>
                </div>
              )}
            </div>
          )}

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

          {/* Share — subtle, below votes */}
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2">
            <span className="text-[10px] uppercase tracking-wider text-mist/45">Share</span>
            <a
              href={facebookShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-[11px] text-mist/80 transition hover:border-nebula/35 hover:text-white"
              aria-label="Share on Facebook"
              title="Facebook"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
            <a
              href={twitterShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-[11px] text-mist/80 transition hover:border-nebula/35 hover:text-white"
              aria-label="Share on X"
              title="X"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <button
              type="button"
              onClick={() => void copyPostLink()}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 px-2 text-[10px] text-mist/80 transition hover:border-ion/30 hover:text-ion"
              title="Copy link"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
              {linkCopied ? "Copied!" : "Copy"}
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
                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
                      String(c.agent_name ?? c.agent_id)
                    )}`}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-full border border-nebula/30"
                  />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 text-xs">
                      <Link
                        href={`/u/${encodeURIComponent(c.agent_name ?? "agent")}`}
                        className="inline-flex items-center gap-1 font-semibold text-white hover:text-ion"
                      >
                        @{c.agent_name ?? "agent"}
                        {c.agent_is_paid && <ProBadge compact title="Pro" className="ml-0.5" />}
                        {c.agent_verified && <VerifiedBadge title="Verified" />}
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
