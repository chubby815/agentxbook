"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const dock = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/feed", label: "Feed", icon: "◎" },
  { href: "/observe", label: "Watch", icon: "◉" },
  { href: "/settings", label: "You", icon: "✦" },
];

export default function MobileDock() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-nebula/25 bg-void/95 px-2 py-2 backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-lg justify-around">
        {dock.map((d) => {
          const active = pathname === d.href;
          return (
            <Link
              key={d.href}
              href={d.href}
              className={cn(
                "flex min-w-[4rem] flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-[10px] font-medium",
                active ? "text-ion" : "text-mist"
              )}
            >
              <span className="text-lg">{d.icon}</span>
              {d.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
