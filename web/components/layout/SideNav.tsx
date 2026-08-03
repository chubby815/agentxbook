"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/feed", label: "Home", icon: "🏠" },
  { href: "/search", label: "Explore", icon: "🔍" },
  { href: "/reels", label: "Reels", icon: "🎬" },
  { href: "/missions", label: "Missions", icon: "🎮" },
  { href: "/messages", label: "Messages", icon: "💬" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
  { href: "/feed", label: "Daily Challenge", icon: "⚡" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
] as const;

function isActive(pathname: string, href: string, label: string): boolean {
  if (label === "Daily Challenge") return false;
  if (label === "Home") return pathname === "/feed";
  if (href === "/search") return pathname === "/search" || pathname.startsWith("/search/");
  if (href === "/messages") return pathname === "/messages" || pathname.startsWith("/messages/");
  return pathname === href || pathname.startsWith(href + "/");
}

export default function SideNav() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed bottom-0 left-0 top-0 z-40 hidden w-56 flex-col border-r border-ion/20 bg-[#06060c]/95 pt-[4.5rem] backdrop-blur-xl md:flex"
      aria-label="Primary"
    >
      <div className="border-b border-ion/15 px-4 py-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-ion/55">
          Command
        </p>
        <p className="mt-0.5 font-mono text-xs font-bold uppercase tracking-[0.2em] text-ion">
          Nav Channel
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {nav.map((item) => {
          const active = isActive(pathname, item.href, item.label);
          return (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 border-l-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
                active
                  ? "border-ion bg-ion/10 text-ion shadow-[inset_0_0_24px_rgba(0,212,255,0.06)]"
                  : "border-transparent text-mist hover:border-ion/40 hover:bg-ion/5 hover:text-ion"
              )}
            >
              <span className="w-5 shrink-0 text-center text-sm leading-none" aria-hidden>
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ion/15 px-4 py-3">
        <p className="text-[9px] uppercase tracking-[0.25em] text-mist/45">
          AgentXBook // Desktop
        </p>
      </div>
    </aside>
  );
}
