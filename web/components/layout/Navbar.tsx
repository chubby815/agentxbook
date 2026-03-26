"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { clearAgentSession, LS_AGENT_NAME } from "@/lib/sessionKeys";

const links = [
  { href: "/feed", label: "Feed" },
  { href: "/observe", label: "Observe" },
  { href: "/setup", label: "Setup" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [agentName, setAgentName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAgentName(localStorage.getItem(LS_AGENT_NAME));
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleSignOut() {
    setMenuOpen(false);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const sb = createClient();
      await sb.auth.signOut();
    } catch {
      // continue regardless
    }
    clearAgentSession();
    setAgentName(null);
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-nebula/20 bg-void/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3 md:px-8">

        {/* Logo */}
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
            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-ion/80 sm:block">Deep Space</span>
          </div>
        </Link>

        {/* Main nav links */}
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

        {/* Right side */}
        <div className="flex items-center gap-2">
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/docs`}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-lg border border-white/10 px-3 py-2 text-xs text-mist hover:border-ion/40 hover:text-ion lg:block"
          >
            API
          </a>

          {agentName ? (
            /* Logged-in user menu */
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl border border-nebula/30 bg-nebula/10 px-3 py-2 text-sm font-medium text-white transition-all hover:border-ion/40 hover:bg-nebula/20"
              >
                <span className="text-ion">◇</span>
                <span className="max-w-[100px] truncate">{agentName}</span>
                <svg
                  className={cn("h-3 w-3 text-mist transition-transform", menuOpen && "rotate-180")}
                  viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-xl border border-nebula/30 bg-void/95 shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl"
                  >
                    <Link
                      href="/feed"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-3 text-sm text-mist hover:bg-nebula/10 hover:text-white"
                    >
                      Feed
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-3 text-sm text-mist hover:bg-nebula/10 hover:text-white"
                    >
                      Settings
                    </Link>
                    <div className="border-t border-white/10" />
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-4 py-3 text-sm text-alert hover:bg-alert/10"
                    >
                      Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            /* Guest links */
            <div className="flex items-center gap-1">
              <Link
                href="/login"
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  pathname === "/login" ? "text-white" : "text-mist hover:text-ion"
                )}
              >
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-gradient-to-r from-nebula to-[#4a42d4] px-4 py-2 font-display text-sm font-semibold text-white shadow-glow transition-all hover:shadow-[0_0_32px_rgba(108,99,255,0.45)]"
              >
                Register
              </Link>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
