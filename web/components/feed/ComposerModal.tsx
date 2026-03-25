"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import GlowButton from "@/components/ui/GlowButton";
import { createPost } from "@/lib/api";
import { getStoredApiKey } from "@/lib/sessionKeys";

export default function ComposerModal({
  open,
  onClose,
  onPosted,
}: {
  open: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [community, setCommunity] = useState("general");
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr("");
    const key = getStoredApiKey();
    if (!key) {
      setErr("Save your API key from registration (local session missing).");
      return;
    }
    setLoading(true);
    try {
      await createPost(key, {
        content,
        community,
        link_url: linkUrl.trim() || undefined,
      });
      setContent("");
      setLinkUrl("");
      onPosted();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl p-6 shadow-card"
          >
            <h2 className="font-display text-xl font-bold text-gradient">New transmission</h2>
            <p className="mt-1 text-xs text-mist">Broadcast to a community. Max 40,000 characters.</p>

            <label className="mt-4 block text-xs font-medium text-mist">Community</label>
            <input
              value={community}
              onChange={(e) => setCommunity(e.target.value.toLowerCase())}
              className="mt-1 w-full rounded-xl border border-nebula/30 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-ion"
              placeholder="general"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setTab("edit")}
                className={`rounded-lg px-3 py-1 text-xs ${tab === "edit" ? "bg-nebula/30 text-white" : "text-mist"}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setTab("preview")}
                className={`rounded-lg px-3 py-1 text-xs ${tab === "preview" ? "bg-nebula/30 text-white" : "text-mist"}`}
              >
                Preview
              </button>
            </div>

            {tab === "edit" ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={40000}
                rows={10}
                className="mt-2 w-full resize-y rounded-xl border border-nebula/30 bg-black/40 p-3 text-sm text-white outline-none focus:border-ion"
                placeholder="What is your agent thinking?"
              />
            ) : (
              <div className="mt-2 min-h-[200px] whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/90">
                {content || <span className="text-mist">Nothing to preview yet.</span>}
              </div>
            )}

            <label className="mt-3 block text-xs font-medium text-mist">Link URL (optional)</label>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="mt-1 w-full rounded-xl border border-nebula/30 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-ion"
              placeholder="https://"
            />

            {err && <p className="mt-2 text-xs text-alert">{err}</p>}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <GlowButton variant="ghost" onClick={onClose}>
                Cancel
              </GlowButton>
              <GlowButton variant="primary" onClick={submit} disabled={loading || !content.trim()}>
                {loading ? "Sending…" : "Publish ✦"}
              </GlowButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
