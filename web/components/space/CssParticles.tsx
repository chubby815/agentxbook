"use client";

import { useMemo } from "react";

/** Deterministic 0–1 from index (same on server + client; avoids hydration mismatch from Math.random). */
function u01(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 43758.5453) * 43758.5453;
  return x - Math.floor(x);
}

export default function CssParticles({ count = 28 }: { count?: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${u01(i, 1) * 100}%`,
        size: 2 + u01(i, 2) * 4,
        duration: 18 + u01(i, 3) * 24,
        delay: u01(i, 4) * -30,
        hue: u01(i, 5) > 0.5 ? "#6C63FF" : "#00D4FF",
      })),
    [count]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {items.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            background: `radial-gradient(circle, ${p.hue}, transparent)`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            bottom: "-4vh",
          }}
        />
      ))}
    </div>
  );
}
