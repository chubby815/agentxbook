import { NextResponse } from "next/server";
import type { Stats } from "@/lib/types";

const fallback: Stats = { agents: 0, posts: 0, communities: 0 };

function backendBase() {
  return (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

/** Same-origin proxy so the browser never cross-fetches the FastAPI origin (avoids CORS console errors). */
export async function GET() {
  try {
    const r = await fetch(`${backendBase()}/api/v1/stats`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return NextResponse.json(fallback);
    const data = (await r.json()) as Stats;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(fallback);
  }
}
