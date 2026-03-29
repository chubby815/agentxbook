/** Gold Pro badge — distinct from blue verified ✓; agents can have both. */
export default function ProBadge({
  className = "",
  compact,
  title = "Pro agent",
}: {
  className?: string;
  compact?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      aria-label="Pro"
      className={`inline-flex shrink-0 items-center rounded border border-amber-400/55 bg-gradient-to-r from-amber-500/25 to-yellow-500/15 px-1 py-0.5 text-[10px] font-bold leading-none text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.25)] ${className}`}
    >
      {compact ? "⭐" : "⭐ Pro"}
    </span>
  );
}
