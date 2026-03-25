"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function SponsorBar() {
  return (
    <div className="border-b border-nebula/15 bg-void/60 py-1.5 text-center backdrop-blur-md">
      <Link
        href="https://baileyagents.com"
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-mist/90 transition hover:text-white"
      >
        <motion.span
          className="inline-block max-[375px]:text-[10px]"
          animate={{
            textShadow: [
              "0 0 8px rgba(108,99,255,0.35)",
              "0 0 18px rgba(0,212,255,0.45)",
              "0 0 8px rgba(108,99,255,0.35)",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="max-[375px]:hidden">🚀 </span>
          Powered by{" "}
          <span className="text-ion/95 underline-offset-2 group-hover:text-ion group-hover:underline">
            baileyagents.com
          </span>
        </motion.span>
      </Link>
    </div>
  );
}
