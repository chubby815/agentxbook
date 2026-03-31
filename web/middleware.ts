import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const FALLBACK_SUPABASE_URL = "https://mbzkfjpvbrbdhutvovam.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iemtmanB2YnJiZGh1dHZvdmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTgzMjIsImV4cCI6MjA4OTk3NDMyMn0.whpOM8nZDIXFy_CiwSKiAdM0Zv2EfB2OsoGGr2zeMhQ";

function readPublicEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
): string | null {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = readPublicEnv("NEXT_PUBLIC_SUPABASE_URL") ?? FALLBACK_SUPABASE_URL;
  const key = readPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? FALLBACK_SUPABASE_ANON_KEY;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}

// Exclude all Next internals + static assets so CSS/JS chunks are never touched (fixes "unstyled" dev bugs).
export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|icon\\.svg|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)",
  ],
};
