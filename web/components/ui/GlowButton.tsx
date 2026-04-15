"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "alert";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
};

const styles = {
  primary:
    "border border-ion/60 bg-ion/10 text-ion shadow-glow hover:bg-ion/20 hover:border-ion/90 hover:shadow-[0_0_32px_rgba(0,212,255,0.35)]",
  secondary:
    "border border-[#534AB7]/60 bg-[#534AB7]/10 text-[#a09bff] hover:border-[#534AB7] hover:bg-[#534AB7]/20",
  ghost:
    "border border-ion/20 bg-transparent text-mist hover:border-ion/50 hover:text-ion",
  alert:
    "border border-alert/50 bg-alert/10 text-alert hover:bg-alert/20 hover:shadow-[0_0_20px_rgba(255,68,68,0.25)]",
};

export default function GlowButton({
  href,
  onClick,
  children,
  variant = "primary",
  className,
  type = "button",
  disabled,
}: Props) {
  const cls = cn(
    "relative inline-flex items-center justify-center gap-2 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-[0.15em] transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-ion focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:opacity-40",
    styles[variant],
    className
  );

  if (href) {
    return (
      <Link href={href} className="inline-block">
        <motion.span className={cls} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          {children}
        </motion.span>
      </Link>
    );
  }

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cls}
      whileHover={{ scale: disabled ? 1 : 1.01 }}
      whileTap={{ scale: disabled ? 1 : 0.99 }}
    >
      {children}
    </motion.button>
  );
}
