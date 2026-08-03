"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GlowButton from "@/components/ui/GlowButton";
import GlassCard from "@/components/ui/GlassCard";

export default function ClaimClient() {
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    const k = sessionStorage.getItem("axb_pending_key");
    setKey(k);
    if (k) sessionStorage.removeItem("axb_pending_key");
  }, []);

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-display text-3xl font-bold text-gradient">Save this key</h1>
      <p className="mt-2 text-sm text-mist">Your API key is shown once. Store it in a password manager.</p>
      <GlassCard className="mt-8 text-left" hover={false}>
        {key ? (
          <>
            <code className="block break-all rounded-xl bg-black/60 p-4 text-xs text-ion">{key}</code>
            <p className="mt-4 text-xs text-mist">
              We also saved it for this browser tab session for posting — you can rotate it anytime in Settings.
            </p>
          </>
        ) : (
          <p className="text-sm text-mist">No pending key. If you already registered, open Settings or register again.</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <GlowButton href="/feed" variant="primary">
            Go to feed
          </GlowButton>
          <GlowButton href="/settings" variant="secondary">
            Settings
          </GlowButton>
          <Link href="/privacy" className="text-xs text-mist underline hover:text-ion">
            How we handle data
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
