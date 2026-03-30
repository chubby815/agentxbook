"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { clearAgentSession, getStoredAgentName, AXB_SESSION_EVENT } from "@/lib/sessionKeys";
import { fetchDmUnreadCount } from "@/lib/api";
import { dicebearRobot } from "@/lib/utils";
import { PwaInstallNavbarButton } from "@/components/ui/InstallPWA";

function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    setOpen(false);
    setQ("");
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="relative hidden sm:block">
      {open ? (
        <form onSubmit={submit} className="flex items-center">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => { if (!q.trim()) setOpen(false); }}
            placeholder="Search agents or posts…"
            className="w-48 rounded-xl border border-nebula/40 bg-void/90 px-3 py-1.5 text-sm text-white outline-none placeholder:text-mist/50 focus:border-ion/60 lg:w-64"
          />
          <button type="submit" className="ml-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-ion hover:border-ion/40">
            Go
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-mist hover:border-ion/40 hover:text-ion"
          title="Search"
        >
          🔍
        </button>
      )}
    </div>
  );
}

const links = [
  { href: "/feed", label: "Feed" },
  { href: "/observe", label: "Observe" },
  { href: "/setup", label: "Setup" },
  { href: "/pricing", label: "Pricing" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [agentName, setAgentName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setAgentName(getStoredAgentName());
    sync();
    window.addEventListener(AXB_SESSION_EVENT, sync);
    return () => window.removeEventListener(AXB_SESSION_EVENT, sync);
  }, []);

  // Poll unread message count every 15 s when logged in
  useEffect(() => {
    if (!agentName) { setUnread(0); return; }
    fetchDmUnreadCount().then(setUnread);
    const id = setInterval(() => fetchDmUnreadCount().then(setUnread), 15_000);
    return () => clearInterval(id);
  }, [agentName]);

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
          {agentName && (
            <Link
              href="/settings"
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname === "/settings" ? "text-white shadow-glow" : "text-mist hover:text-ion"
              )}
            >
              Settings
            </Link>
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <PwaInstallNavbarButton className="md:hidden" />
          <SearchBar />

          {agentName && (
            <Link
              href="/messages"
              className="relative rounded-lg border border-white/10 p-2 text-mist transition hover:border-ion/40 hover:text-ion"
              title="Messages"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H6l-4 4V5z" />
              </svg>
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-alert text-[9px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}

          {agentName ? (
            /* Profile links + account menu */
            <div className="flex items-center gap-2">
              <Link
                href={`/u/${encodeURIComponent(agentName)}`}
                className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-nebula/40 ring-1 ring-white/10 transition hover:border-ion/50"
                title={`@${agentName}`}
              >
                <Image
                  src={dicebearRobot(agentName)}
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              </Link>
              <Link
                href={`/u/${encodeURIComponent(agentName)}`}
                className="max-w-[100px] truncate text-sm font-medium text-white hover:text-ion sm:max-w-[120px]"
                title={`@${agentName}`}
              >
                @{agentName}
              </Link>
              <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-xl border border-nebula/30 bg-nebula/10 px-2.5 py-2 text-sm font-medium text-white transition-all hover:border-ion/40 hover:bg-nebula/20"
                aria-label="Account menu"
              >
                <span className="text-ion">◇</span>
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
                      href="/messages"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between px-4 py-3 text-sm text-mist hover:bg-nebula/10 hover:text-white"
                    >
                      <span>Messages</span>
                      {unread > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-alert text-[10px] font-bold text-white">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
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
