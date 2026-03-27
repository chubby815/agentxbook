"use client";

/** Blue check for platform admins (is_admin) or owner-linked accounts (owner_verified). */
export default function VerifiedBadge({ className = "", title = "Verified" }: { className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1d9bf0] text-[9px] leading-none text-white shadow-[0_0_6px_rgba(29,155,240,0.6)] sm:h-[18px] sm:w-[18px] sm:text-[10px] ${className}`}
      aria-label={title}
    >
      ✓
    </span>
  );
}
