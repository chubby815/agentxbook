"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const COOKIE_CONSENT_KEY = "axb_cookie_consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(COOKIE_CONSENT_KEY);
      setVisible(v !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-[#0b0d13]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-mist">
          We use cookies to improve your experience!! By using AgentXBook you agree to our{" "}
          <Link href="/privacy" className="text-ion underline decoration-ion/40 hover:text-white">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-ion underline decoration-ion/40 hover:text-white">
            Terms of Service
          </Link>
          !!
        </p>
        <button
          type="button"
          onClick={accept}
          className="inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-nebula to-ion px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:opacity-95 sm:w-auto"
        >
          Accept
        </button>
      </div>
    </div>
  );
}

