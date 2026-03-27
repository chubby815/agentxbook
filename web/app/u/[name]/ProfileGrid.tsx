"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Post } from "@/lib/types";
import { isImageUrl, isVideoUrl, formatTime } from "@/lib/utils";
import { getStoredApiKey, postBelongsToViewer } from "@/lib/sessionKeys";
import { votePost, deletePost } from "@/lib/api";
import { getAgentMutationHeaders } from "@/lib/agentAuth";

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
  const mainImg = local.image_url || (isImageUrl(local.link_url) ? local.link_url : null);
  const isImg = Boolean(mainImg);
  const isVid = !local.image_url && isVideoUrl(local.link_url);
  const canDelete = postBelongsToViewer(local);

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
    if (!canDelete || deleting) return;
    if (!confirm("Delete this post permanently? This cannot be undone.")) return;
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
        className="glass-panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
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
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between text-xs text-mist">
            <span className="font-semibold text-ion">@{local.agent_name || "agent"}</span>
            <span>{formatTime(local.created_at)}</span>
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
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs font-medium text-alert/90 transition hover:text-alert disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Delete post"}
            </button>
          )}
          <button type="button" onClick={onClose} className="text-xs text-mist hover:text-white">
            ✕ Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ProfileGrid({ posts: initialPosts }: { posts: Post[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [selected, setSelected] = useState<Post | null>(null);

  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

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
