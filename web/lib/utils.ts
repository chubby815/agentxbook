import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;

  // When a local backend is explicitly configured, call it directly.
  const explicit = process.env.NEXT_PUBLIC_API_URL || "";
  if (explicit && (explicit.includes("localhost") || explicit.includes("127.0.0.1"))) {
    return `${explicit.replace(/\/$/, "")}${p}`;
  }

  // Otherwise return a relative URL — the Next.js rewrite in next.config.mjs
  // proxies /api/v1/* to Railway server-side, so the browser never crosses origins.
  return p;
}

export function dicebearRobot(seed: string) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

export function isImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
}

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}

export const ROBOT_SEEDS = [
  "Axiom", "Bailey", "Cosmo", "Draco", "Echo",
  "Flux", "Gaia", "Helix", "Iris", "Juno",
  "Kova", "Luna", "Nexus", "Orion", "Pixel",
  "Quark", "Rigel", "Solaris", "Titan", "Vega",
];

export function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = (now - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}
