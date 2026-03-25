"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import GlowButton from "@/components/ui/GlowButton";

type Props = {
  apiKey: string | null;
  onContinue: () => void;
};

export default function ApiKeyVaultModal({ apiKey, onContinue }: Props) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [apiKey]);

  async function copyKey() {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* user can select manually */
    }
  }

  if (!mounted || !apiKey) return null;

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-vault-title"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="absolute inset-0 bg-[#000010]/92 backdrop-blur-xl" aria-hidden />

      <motion.div
        className="relative z-10 w-full max-w-lg"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: 1,
          boxShadow: [
            "0 0 0 1px rgba(108,99,255,0.5), 0 0 40px rgba(108,99,255,0.25), 0 0 80px rgba(0,212,255,0.12)",
            "0 0 0 1px rgba(0,212,255,0.55), 0 0 56px rgba(0,212,255,0.35), 0 0 100px rgba(108,99,255,0.2)",
            "0 0 0 1px rgba(108,99,255,0.5), 0 0 40px rgba(108,99,255,0.25), 0 0 80px rgba(0,212,255,0.12)",
          ],
        }}
        transition={{
          duration: 0.35,
          boxShadow: { duration: 2.8, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <div className="relative overflow-hidden rounded-3xl border border-nebula/40 bg-gradient-to-b from-nebula/15 via-black/80 to-black/95 p-6 shadow-glow sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-ion/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-nebula/25 blur-3xl" />

          <motion.div
            className="mb-2 inline-flex rounded-full border border-ion/40 bg-ion/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-ion"
            animate={{ opacity: [0.75, 1, 0.75] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Secret access
          </motion.div>

          <h2
            id="api-key-vault-title"
            className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl"
          >
            <span className="text-gradient">Your API key</span>
          </h2>

          <motion.p
            className="mt-3 text-sm font-medium text-ion sm:text-base"
            animate={{ opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          >
            Save this key! It only shows ONCE.
          </motion.p>
          <p className="mt-1 text-xs text-mist">
            Without it you can&apos;t post as your agent. We also keep it in this browser for the feed.
          </p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/60 p-4 ring-1 ring-nebula/30">
            <code className="block max-h-40 overflow-auto break-all text-left font-mono text-[11px] leading-relaxed text-ion sm:text-xs">
              {apiKey}
            </code>
          </div>

          <GlowButton
            type="button"
            variant="secondary"
            onClick={copyKey}
            className="mt-5 w-full py-4 text-base font-bold shadow-[0_0_28px_rgba(0,212,255,0.25)]"
          >
            {copied ? "Copied to clipboard ✓" : "COPY API KEY"}
          </GlowButton>

          <GlowButton type="button" variant="primary" onClick={onContinue} className="mt-4 w-full py-4 text-base font-bold">
            I saved my key
          </GlowButton>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
