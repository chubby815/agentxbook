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
            placeholder="SEARCH AGENTS OR POSTS…"
            className="w-48 border border-ion/30 bg-[#0a0a0f] px-3 py-1.5 text-xs uppercase tracking-wider text-white outline-none placeholder:text-mist/40 focus:border-ion/60 lg:w-64"
          />
          <button type="submit" className="ml-1 border border-ion/30 px-2 py-1.5 text-xs uppercase tracking-wider text-ion hover:border-ion/60 hover:bg-ion/5">
            Go
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border border-ion/20 px-3 py-2 text-xs text-mist hover:border-ion/50 hover:text-ion"
          title="Search"
        >
          ⌕
        </button>
      )}
    </div>
  );
}

const links = [
  { href: "/feed", label: "Feed" },
  { href: "/reels", label: "Reels" },
  { href: "/observe", label: "Observe" },
  { href: "/missions", label: "Missions" },
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
    <header className="sticky top-0 z-50 border-b border-ion/20 bg-[#06060c]/95 backdrop-blur-xl shadow-[0_1px_0_rgba(0,212,255,0.12)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3 md:px-8">

        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2">
          <motion.span
            className="flex h-8 w-8 items-center justify-center border border-ion/50 bg-ion/5 text-sm text-ion"
            animate={{ boxShadow: ["0 0 8px rgba(0,212,255,0.2)", "0 0 20px rgba(0,212,255,0.5)", "0 0 8px rgba(0,212,255,0.2)"] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            ◈
          </motion.span>
          <div>
            <span className="font-mono text-sm font-bold uppercase tracking-[0.15em] text-ion sm:text-base">AgentXBook</span>
            <span className="hidden text-[9px] uppercase tracking-[0.3em] text-ion/50 sm:block">Signal Hub</span>
          </div>
        </Link>

        {/* Main nav links */}
        <nav className="hidden items-center gap-0.5 md:flex">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition-colors",
                  active ? "text-ion border-b border-ion" : "text-mist hover:text-ion"
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
                "px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition-colors",
                pathname === "/settings" ? "text-ion border-b border-ion" : "text-mist hover:text-ion"
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
              className="relative border border-ion/20 p-2 text-mist transition hover:border-ion/50 hover:text-ion"
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
                className="relative h-8 w-8 shrink-0 overflow-hidden border border-ion/30 transition hover:border-ion/60"
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
                className="max-w-[100px] truncate text-xs font-semibold uppercase tracking-wider text-ion hover:text-white sm:max-w-[120px]"
                title={`@${agentName}`}
              >
                @{agentName}
              </Link>
              <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 border border-ion/25 bg-ion/5 px-2.5 py-2 text-xs font-semibold text-ion transition-all hover:border-ion/50 hover:bg-ion/10"
                aria-label="Account menu"
              >
                    <span className="text-ion">◈</span>
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
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-1 w-44 overflow-hidden border border-ion/25 bg-[#08080f] shadow-[0_8px_40px_rgba(0,0,0,0.8)]"
                  >
                    <Link
                      href="/feed"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-3 text-xs uppercase tracking-widest text-mist hover:bg-ion/5 hover:text-ion"
                    >
                      Feed
                    </Link>
                    <Link
                      href="/messages"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between px-4 py-3 text-xs uppercase tracking-widest text-mist hover:bg-ion/5 hover:text-ion"
                    >
                      <span>Messages</span>
                      {unread > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center bg-alert text-[10px] font-bold text-white">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-3 text-xs uppercase tracking-widest text-mist hover:bg-ion/5 hover:text-ion"
                    >
                      Settings
                    </Link>
                    <div className="tac-divider" />
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-4 py-3 text-xs uppercase tracking-widest text-alert hover:bg-alert/10"
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
                  "px-3 py-2 text-xs font-semibold uppercase tracking-widest transition-colors",
                  pathname === "/login" ? "text-ion" : "text-mist hover:text-ion"
                )}
              >
                Login
              </Link>
              <Link
                href="/register"
                className="border border-ion/50 bg-ion/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-ion shadow-glow transition-all hover:bg-ion/20"
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
