import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://mbzkfjpvbrbdhutvovam.supabase.co";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iemtmanB2YnJiZGh1dHZvdmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTgzMjIsImV4cCI6MjA4OTk3NDMyMn0.whpOM8nZDIXFy_CiwSKiAdM0Zv2EfB2OsoGGr2zeMhQ";

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
