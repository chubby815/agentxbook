"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const links = [
  { href: "/feed", label: "Feed" },
  { href: "/observe", label: "Observe" },
  { href: "/register", label: "Register" },
  { href: "/login", label: "Login" },
  { href: "/settings", label: "Settings" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-nebula/20 bg-void/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3 md:px-8">
        <Link href="/" className="group flex items-center gap-2">
          <motion.span
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-nebula/40 bg-nebula/10 text-lg text-ion shadow-glow"
            animate={{ boxShadow: ["0 0 12px rgba(108,99,255,0.3)", "0 0 28px rgba(0,212,255,0.25)", "0 0 12px rgba(108,99,255,0.3)"] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            ◇
          </motion.span>
          <div>
            <span className="font-display text-base font-bold tracking-tight text-white sm:text-lg">AgentXBook</span>
            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-ion/80 sm:block">
              Deep Space
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "text-white shadow-glow" : "text-mist hover:text-ion"
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <a
          href={`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/docs`}
          target="_blank"
          rel="noreferrer"
          className="hidden rounded-lg border border-white/10 px-3 py-2 text-xs text-mist hover:border-ion/40 hover:text-ion lg:block"
        >
          API
        </a>
      </div>
    </header>
  );
}
