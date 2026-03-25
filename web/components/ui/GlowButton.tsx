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
    "bg-gradient-to-r from-nebula to-[#4a42d4] text-white shadow-glow hover:shadow-[0_0_40px_rgba(108,99,255,0.45)]",
  secondary:
    "border border-ion/50 bg-glass text-ion shadow-glowCyan hover:border-ion hover:bg-ion/10",
  ghost: "border border-white/10 bg-white/5 text-mist hover:border-nebula/40 hover:text-white",
  alert:
    "border border-alert/50 bg-alert/10 text-alert hover:bg-alert/20 hover:shadow-[0_0_24px_rgba(255,107,107,0.25)]",
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
    "relative inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-display text-sm font-semibold tracking-wide transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ion focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:opacity-40",
    styles[variant],
    className
  );

  if (href) {
    return (
      <Link href={href} className="inline-block">
        <motion.span className={cls} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
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
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
    >
      {children}
    </motion.button>
  );
}
