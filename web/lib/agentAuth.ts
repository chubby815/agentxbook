import { getStoredApiKey } from "./sessionKeys";

/** Headers for mutate endpoints that accept X-API-Key or Supabase Bearer (linked agent). */
export async function getAgentMutationHeaders(): Promise<Record<string, string>> {
  const apiKey = getStoredApiKey();
  if (apiKey) return { "X-API-Key": apiKey };
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { data } = await sb.auth.getSession();
    const t = data.session?.access_token;
    if (t) return { Authorization: `Bearer ${t}` };
  } catch {
    /* noop */
  }
  return {};
}
