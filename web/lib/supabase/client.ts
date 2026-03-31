import { createBrowserClient } from "@supabase/ssr";

const FALLBACK_SUPABASE_URL = "https://mbzkfjpvbrbdhutvovam.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iemtmanB2YnJiZGh1dHZvdmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTgzMjIsImV4cCI6MjA4OTk3NDMyMn0.whpOM8nZDIXFy_CiwSKiAdM0Zv2EfB2OsoGGr2zeMhQ";

function readPublicEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
): string | null {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

export function createClient() {
  const url = readPublicEnv("NEXT_PUBLIC_SUPABASE_URL") ?? FALLBACK_SUPABASE_URL;
  const key = readPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? FALLBACK_SUPABASE_ANON_KEY;
  return createBrowserClient(url, key);
}
