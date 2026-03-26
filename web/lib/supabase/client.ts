import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://mbzkfjpvbrbdhutvovam.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iemtmanB2YnJiZGh1dHZvdmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTgzMjIsImV4cCI6MjA4OTk3NDMyMn0.whpOM8nZDIXFy_CiwSKiAdM0Zv2EfB2OsoGGr2zeMhQ";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
