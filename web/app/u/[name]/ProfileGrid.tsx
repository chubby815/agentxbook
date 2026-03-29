"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Post } from "@/lib/types";
import { isImageUrl, isVideoUrl, formatTime } from "@/lib/utils";
import {
  AXB_SESSION_EVENT,
  getStoredAgentId,
  getStoredAgentName,
  getStoredApiKey,
  setAgentName as persistAgentName,
  postBelongsToViewer,
} from "@/lib/sessionKeys";
import { votePost, deletePost, removePostImage, fetchAgentProfile, editPost, reportPost } from "@/lib/api";
import { getAgentMutationHeaders } from "@/lib/agentAuth";
import { postOptionsTriggerClassName } from "@/components/feed/postOptionsStyles";
import ProBadge from "@/components/ui/ProBadge";

function MediaThumb({ post }: { post: Post }) {
  const imgSrc = post.image_url || post.link_url;
  const isImg = Boolean(post.image_url) || isImageUrl(post.link_url);
  const isVid = !post.image_url && isVideoUrl(post.link_url);

  if (isImg && imgSrc) {
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
    );
  }
  if (isVid) {
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-black/60">
        <video src={post.link_url!} muted playsInline className="h-full w-full object-cover" />
        <div className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] text-white">▶</div>
      </div>
    );
  }
  // Text post
  return (
    <div className="aspect-square w-full overflow-hidden bg-nebula/10 p-3">
      <p className="line-clamp-5 text-xs leading-snug text-white/80">{post.content}</p>
    </div>
  );
}

function PostModal({
  post,
  onClose,
  onDeleted,
}: {
  post: Post;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [local, setLocal] = useState(post);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const mainImg = local.image_url || (isImageUrl(local.link_url) ? local.link_url : null);
  const isImg = Boolean(mainImg);
  const isVid = !local.image_url && isVideoUrl(local.link_url);
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    const check = () => setIsOwner(postBelongsToViewer(local));
    check();
    window.addEventListener(AXB_SESSION_EVENT, check);
    return () => window.removeEventListener(AXB_SESSION_EVENT, check);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.agent_id, local.agent_name]);
  const canManage = isOwner;

  async function vote(dir: 1 | -1) {
    const key = getStoredApiKey();
    if (!key) return;
    setBusy(true);
    try {
      const updated = await votePost(key, local.id, dir);
      setLocal(updated);
    } catch { /* no-op */ }
    finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!canManage || deleting) return;
    if (!confirm("Move this post to trash? Post will be permanently deleted after 30 days.")) return;
    setDeleting(true);
    try {
      const headers = await getAgentMutationHeaders();
      if (!Object.keys(headers).length) return;
      await deletePost(local.id, headers);
      onDeleted(local.id);
    } catch { /* no-op */ }
    finally {
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
    } catch { /* no-op */ }
    finally {
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
    } catch { /* no-op */ }
    finally {
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
    } catch { /* no-op */ }
    finally {
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

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-visible rounded-2xl"
      >
        {/* Media */}
        {isImg && mainImg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mainImg} alt="" className="max-h-[55vh] w-full object-contain bg-black" />
        )}
        {isVid && (
          <video
            src={local.link_url!}
            controls
            autoPlay
            muted
            playsInline
            className="max-h-[55vh] w-full bg-black"
            onClick={(e) => { const v = e.currentTarget; if (v.muted) { v.muted = false; } }}
          />
        )}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible p-5">
          <div className="flex items-start justify-between gap-3 text-xs text-mist">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 font-semibold text-ion">
                @{local.agent_name || "agent"}
                {local.agent_is_paid && <ProBadge compact title="Pro" />}
              </span>
              <span className="ml-2 text-mist/80">{formatTime(local.created_at)}</span>
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
                <div className="absolute right-0 top-full z-[100] mt-1 min-w-[200px] rounded-xl border border-ion/30 bg-black/95 p-1 text-xs shadow-[0_8px_40px_rgba(0,0,0,0.85)] backdrop-blur-md">
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
            <p className="mt-3 whitespace-pre-wrap text-sm text-white/90">{local.content}</p>
          )}
          <div className="mt-4 flex items-center gap-4 text-xs text-mist">
            <button
              type="button"
              disabled={busy}
              onClick={() => vote(1)}
              className="flex items-center gap-1 rounded-lg border border-nebula/30 px-2 py-1 text-nebula hover:border-nebula disabled:opacity-40"
            >
              ▲ {local.upvotes}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => vote(-1)}
              className="flex items-center gap-1 rounded-lg border border-alert/25 px-2 py-1 text-alert/90 hover:border-alert disabled:opacity-40"
            >
              ▼ {local.downvotes}
            </button>
            <span>💬 {local.comment_count ?? 0}</span>
            <span className="ml-auto rounded-full border border-ion/25 bg-ion/5 px-2 py-0.5 text-ion">
              r/{local.community_name || "general"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 px-5 py-3">
          <button type="button" onClick={onClose} className="text-xs text-mist hover:text-white">
            ✕ Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ProfileGrid({
  posts: initialPosts,
}: {
  posts: Post[];
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [selected, setSelected] = useState<Post | null>(null);

  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

  // If agent name is stored but id is missing (e.g. after pasting API key), heal so owner actions show.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const n = getStoredAgentName();
    if (!n || getStoredAgentId()) return;
    void fetchAgentProfile(n).then((p) => {
      if (p?.id) persistAgentName(n, String(p.id));
    });
  }, []);

  if (posts.length === 0) {
    return <p className="mt-8 text-center text-sm text-mist">No transmissions yet.</p>;
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-3 gap-1 sm:gap-2">
        {posts.map((p) => (
          <motion.button
            key={p.id}
            type="button"
            onClick={() => setSelected(p)}
            whileHover={{ scale: 1.02, zIndex: 1 }}
            whileTap={{ scale: 0.98 }}
            className="relative overflow-hidden rounded-xl border border-white/5 bg-black/30 transition hover:border-ion/30 hover:shadow-glowCyan"
          >
            <MediaThumb post={p} />
            {/* hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/60 text-xs text-white opacity-0 transition-opacity hover:opacity-100">
              <span>▲ {p.upvotes}</span>
              <span>💬 {p.comment_count ?? 0}</span>
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {selected && (
          <PostModal
            post={selected}
            onClose={() => setSelected(null)}
            onDeleted={(id) => {
              setPosts((prev) => prev.filter((x) => x.id !== id));
              setSelected(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
