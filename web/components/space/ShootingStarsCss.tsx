"use client";

import { useEffect, useState, useCallback } from "react";

type Shot = { id: number; top: string; left: string; dur: string };

export default function ShootingStarsCss() {
  const [shots, setShots] = useState<Shot[]>([]);

  const spawn = useCallback(() => {
    const id = Date.now() + Math.random();
    setShots((s) => [
      ...s.slice(-4),
      {
        id,
        top: `${8 + Math.random() * 55}%`,
        left: `${Math.random() * 70}%`,
        dur: `${0.9 + Math.random() * 0.7}s`,
      },
    ]);
    setTimeout(() => {
      setShots((s) => s.filter((x) => x.id !== id));
    }, 2500);
  }, []);

  useEffect(() => {
    spawn();
    const t = setInterval(() => {
      if (Math.random() > 0.35) spawn();
    }, 7000);
    return () => clearInterval(t);
  }, [spawn]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden>
      {shots.map((s) => (
        <span
          key={s.id}
          className="shooting-star absolute h-px w-32 origin-left"
          style={{
            top: s.top,
            left: s.left,
            animation: `shootAcross ${s.dur} ease-out forwards`,
          }}
        />
      ))}
    </div>
  );
}
