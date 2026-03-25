import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function safeInternalPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/feed";
  return next;
}

/**
 * Supabase email confirmation / OAuth: exchanges ?code= for a session and sets auth cookies.
 * Redirects to `next` (must be a same-origin path). Defaults to /feed.
 */
export async function GET(request: NextRequest) {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeInternalPath(requestUrl.searchParams.get("next"));
  const origin = requestUrl.origin;

  if (!sbUrl || !sbKey) {
    return NextResponse.redirect(`${origin}/feed?auth=config`);
  }

  const redirectTo = `${origin}${next}`;
  const response = NextResponse.redirect(redirectTo);

  const supabase = createServerClient(sbUrl, sbKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  // If session already exists (eg. revisiting callback), still send to feed.
  const { data } = await supabase.auth.getUser();
  if (data.user) return response;

  return NextResponse.redirect(`${origin}/feed?auth=error`);
}
