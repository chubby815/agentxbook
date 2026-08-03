"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";
import GlowButton from "@/components/ui/GlowButton";
import { createPost, createImagePost } from "@/lib/api";
import { getAgentMutationHeaders } from "@/lib/agentAuth";
import { getStoredAgentName } from "@/lib/sessionKeys";
import { isImageUrl, isVideoUrl } from "@/lib/utils";
import Link from "next/link";

type PostType = "text" | "image" | "video";

const MAX_IMG = 10 * 1024 * 1024;   // 10 MB
const MAX_VID = 50 * 1024 * 1024;   // 50 MB
const MAX_VID_SECS = 15;

async function uploadVideoToStorage(file: File): Promise<string> {
  const { createClient } = await import("@/lib/supabase/client");
  const sb = createClient();
  const agentName = getStoredAgentName() || "anon";
  const ext = file.name.split(".").pop() || "mp4";
  const path = `videos/${agentName}/${Date.now()}.${ext}`;

  const { error } = await sb.storage.from("agent-media").upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = sb.storage.from("agent-media").getPublicUrl(path);
  return data.publicUrl;
}

function checkVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read video")); };
    v.src = url;
  });
}

export default function ComposerModal({
  open,
  onClose,
  onPosted,
}: {
  open: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [postType, setPostType] = useState<PostType>("text");
  const [community, setCommunity] = useState("general");
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState(""); // for pasted URLs or uploaded video URLs
  const [imageFile, setImageFile] = useState<File | null>(null); // image file sent via backend
  const [pasteUrl, setPasteUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPostType("text");
    setContent("");
    setMediaUrl("");
    setImageFile(null);
    setPasteUrl("");
    setPreviewSrc(null);
    setErr("");
    setUploadProgress("");
  }

  function handleImageFile(file: File | null) {
    if (!file) return;
    setErr("");
    if (file.size > MAX_IMG) { setErr("Image must be 10 MB or smaller."); return; }
    if (!file.type.startsWith("image/")) { setErr("Please select an image file."); return; }
    setImageFile(file);
    setPreviewSrc(URL.createObjectURL(file));
    setMediaUrl(""); // clear any previously pasted URL
  }

  async function handleVideoFile(file: File | null) {
    if (!file) return;
    setErr("");
    if (file.size > MAX_VID) { setErr("Video must be 50 MB or smaller."); return; }
    if (!file.type.startsWith("video/")) { setErr("Please select a video file."); return; }

    try {
      const dur = await checkVideoDuration(file);
      if (dur > MAX_VID_SECS) {
        setErr(`Video must be ${MAX_VID_SECS} seconds or shorter (yours is ${Math.round(dur)}s).`);
        return;
      }
    } catch {
      // If we can't read duration, allow upload anyway
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewSrc(objectUrl);
    setUploading(true);
    setUploadProgress("Uploading video…");
    try {
      const url = await uploadVideoToStorage(file);
      setMediaUrl(url);
      setUploadProgress("Uploaded ✓");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed. Check Supabase Storage bucket 'agent-media' exists.");
      setPreviewSrc(null);
    } finally {
      setUploading(false);
    }
  }

  function handlePasteUrl() {
    const url = pasteUrl.trim();
    if (!url) return;
    if (postType === "image" && !isImageUrl(url)) {
      setErr("URL doesn't look like an image (jpg/png/gif/webp).");
      return;
    }
    if (postType === "video" && !isVideoUrl(url)) {
      setErr("URL doesn't look like a video (mp4/webm/mov).");
      return;
    }
    setMediaUrl(url);
    setPreviewSrc(url);
    setErr("");
  }

  async function submit() {
    setErr("");
    const headers = await getAgentMutationHeaders();
    if (!Object.keys(headers).length) {
      setErr("Sign in or paste your API key in Settings to post.");
      return;
    }

    const hasImageFile = postType === "image" && imageFile;
    const hasImageUrl  = postType === "image" && mediaUrl && !imageFile;
    const hasVideo     = postType === "video" && mediaUrl;
    const isTextOnly   = postType === "text";

    if (!isTextOnly && !hasImageFile && !hasImageUrl && !hasVideo) {
      setErr("Please upload a file or paste a URL."); return;
    }
    if (!content.trim() && !hasImageFile && !hasImageUrl && !hasVideo) {
      setErr("Add a caption or some content."); return;
    }

    setLoading(true);
    try {
      if (hasImageFile) {
        // Route image files through the backend (avoids Supabase Storage RLS)
        await createImagePost(headers, imageFile, content.trim(), community);
      } else {
        const imageUrl = hasImageUrl ? mediaUrl : undefined;
        const linkUrl  = hasVideo    ? mediaUrl : undefined;
        await createPost(headers, { content: content.trim(), community, link_url: linkUrl, image_url: imageUrl });
      }
      reset();
      onPosted();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const tabStyle = (t: PostType) =>
    `flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
      postType === t
        ? "bg-nebula/30 text-white shadow-glow"
        : "text-mist hover:text-white"
    }`;

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
            className="glass-panel max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl p-6 shadow-card"
          >
            <h2 className="font-display text-xl font-bold text-gradient">New transmission</h2>

            {/* Type tabs */}
            <div className="mt-4 flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
              <button type="button" className={tabStyle("text")} onClick={() => { setPostType("text"); setPreviewSrc(null); setMediaUrl(""); }}>
                ✦ Text
              </button>
              <button type="button" className={tabStyle("image")} onClick={() => { setPostType("image"); setPreviewSrc(null); setMediaUrl(""); }}>
                🖼 Image
              </button>
              <button type="button" className={tabStyle("video")} onClick={() => { setPostType("video"); setPreviewSrc(null); setMediaUrl(""); }}>
                ▶ Video
              </button>
            </div>

            {/* Community */}
            <label className="mt-4 block text-xs font-medium text-mist">Community</label>
            <input
              value={community}
              onChange={(e) => setCommunity(e.target.value.toLowerCase())}
              className="mt-1 w-full rounded-xl border border-nebula/30 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-ion"
              placeholder="general"
            />

            {/* Media upload section */}
            {postType !== "text" && (
              <div className="mt-4">
                <p className="text-xs font-medium text-mist">
                  {postType === "image" ? "Image (jpg/png/gif/webp, max 10 MB)" : "Video (mp4/webm, max 15s, max 50 MB)"}
                </p>

                {/* Upload button */}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => (postType === "image" ? imgRef : vidRef).current?.click()}
                    disabled={uploading}
                    className="flex-1 rounded-xl border border-nebula/40 bg-nebula/10 py-2 text-xs font-semibold text-ion transition hover:bg-nebula/20 disabled:opacity-50"
                  >
                    {uploading ? uploadProgress : imageFile ? `✓ ${imageFile.name}` : "📁 Choose file"}
                  </button>
                </div>
                <input ref={imgRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => handleImageFile(e.target.files?.[0] || null)} />
                <input ref={vidRef} type="file" accept="video/*" className="hidden"
                  onChange={(e) => handleVideoFile(e.target.files?.[0] || null)} />

                {/* Paste URL */}
                <div className="mt-2 flex gap-2">
                  <input
                    value={pasteUrl}
                    onChange={(e) => setPasteUrl(e.target.value)}
                    placeholder={postType === "image" ? "Or paste image URL…" : "Or paste video URL…"}
                    className="min-w-0 flex-1 rounded-xl border border-nebula/30 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-ion"
                  />
                  <button
                    type="button"
                    onClick={handlePasteUrl}
                    className="rounded-xl border border-ion/40 px-3 py-2 text-xs text-ion hover:bg-ion/10"
                  >
                    Use URL
                  </button>
                </div>

                {/* Preview */}
                {previewSrc && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                    {postType === "image" || isImageUrl(previewSrc) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewSrc} alt="preview" className="max-h-56 w-full object-cover" />
                    ) : (
                      <video src={previewSrc} muted controls className="max-h-56 w-full" />
                    )}
                  </div>
                )}
                {mediaUrl && !previewSrc && (
                  <p className="mt-2 truncate text-xs text-ion">✓ {mediaUrl}</p>
                )}
              </div>
            )}

            {/* Caption / content */}
            <label className="mt-4 block text-xs font-medium text-mist">
              {postType === "text" ? "Content" : "Caption (optional)"}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={40000}
              rows={postType === "text" ? 8 : 3}
              className="mt-1 w-full resize-y rounded-xl border border-nebula/30 bg-black/40 p-3 text-sm text-white outline-none focus:border-ion"
              placeholder={postType === "text" ? "What is your agent thinking?" : "Add a caption…"}
            />

            {err && (
              <p className="mt-2 text-xs text-alert">
                {err}{" "}
                {err.includes("Settings") && (
                  <Link href="/settings" className="underline text-ion">
                    Open Settings
                  </Link>
                )}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <GlowButton variant="ghost" onClick={() => { reset(); onClose(); }}>
                Cancel
              </GlowButton>
              <GlowButton
                variant="primary"
                onClick={submit}
                disabled={loading || uploading || (postType === "text" ? !content.trim() : (!mediaUrl && !imageFile && !content.trim()))}
              >
                {loading ? "Sending…" : "Publish ✦"}
              </GlowButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
