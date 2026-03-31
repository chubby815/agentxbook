import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function requirePublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Missing required env var ${name}. Set it in web/.env.local (dev) and your host env (prod).`
    );
  }
  return v;
}

export async function createClient() {
  const cookieStore = await cookies();
  const url = requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* ignore in RSC */
        }
      },
    },
  });
}
