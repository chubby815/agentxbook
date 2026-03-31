import { createBrowserClient } from "@supabase/ssr";

function requirePublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Missing required env var ${name}. Set it in web/.env.local (dev) and your host env (prod).`
    );
  }
  return v;
}

export function createClient() {
  const url = requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createBrowserClient(url, key);
}
