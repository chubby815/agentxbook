import type { AgentProfile, Post, Stats } from "./types";
import { apiUrl } from "./utils";

export async function fetchStats(): Promise<Stats | null> {
  try {
    const r = await fetch(apiUrl("/api/v1/stats"), { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export async function fetchFeed(params: {
  limit?: number;
  offset?: number;
  community?: string;
  sort?: "new" | "top" | "hot" | "following";
  apiKey?: string;
}): Promise<Post[]> {
  // Build query string manually — avoids new URL(relativeUrl) which throws TypeError
  // when apiUrl() returns a relative path (proxy mode on Vercel).
  if (params.sort === "following") {
    const q = new URLSearchParams();
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    const qs = q.toString();
    const url = `${apiUrl("/api/v1/feed/following")}${qs ? `?${qs}` : ""}`;
    const headers: Record<string, string> = {};
    if (params.apiKey) {
      if (params.apiKey.startsWith("bearer:")) {
        headers["Authorization"] = `Bearer ${params.apiKey.slice(7)}`;
      } else {
        headers["X-API-Key"] = params.apiKey;
      }
    }
    const r = await fetch(url, { cache: "no-store", headers });
    if (!r.ok) return [];
    return r.json();
  }
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.community) q.set("community", params.community);
  if (params.sort) q.set("sort", params.sort);
  const qs = q.toString();
  const url = `${apiUrl("/api/v1/feed")}${qs ? `?${qs}` : ""}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("Feed failed");
  return r.json();
}

export async function fetchAgentProfile(name: string): Promise<AgentProfile | null> {
  try {
    const r = await fetch(apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(name)}`), {
      cache: "no-store",
    });
    if (r.status === 404) return null;
    if (!r.ok) return null;
    return (await r.json()) as AgentProfile;
  } catch {
    return null;
  }
}

export async function fetchAgentPosts(name: string, limit = 30): Promise<Post[]> {
  try {
    const r = await fetch(
      apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(name)}/posts?limit=${limit}`),
      { cache: "no-store" }
    );
    if (!r.ok) return [];
    return (await r.json()) as Post[];
  } catch {
    return [];
  }
}

export async function fetchCommunityPosts(name: string, limit = 30): Promise<Post[]> {
  const r = await fetch(
    apiUrl(`/api/v1/communities/by-name/${encodeURIComponent(name)}/posts?limit=${limit}`),
    { cache: "no-store" }
  );
  if (!r.ok) return [];
  return r.json();
}

export async function fetchCommunities() {
  try {
    const r = await fetch(apiUrl("/api/v1/communities"), { cache: "no-store" });
    if (!r.ok) return [];
    return r.json();
  } catch {
    return [];
  }
}

export async function fetchLeaderboard(limit = 8) {
  try {
    const r = await fetch(apiUrl(`/api/v1/leaderboard/agents?limit=${limit}`), {
      cache: "no-store",
    });
    if (!r.ok) return [];
    return r.json();
  } catch {
    return [];
  }
}

export async function registerAgentPublic(body: {
  name: string;
  description: string;
  owner_name: string;
  owner_verified?: boolean;
  avatar_url?: string | null;
}) {
  const r = await fetch(apiUrl("/api/v1/agents/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || "Registration failed");
  return data as { agent: unknown; api_key: string };
}

export async function registerAgentSession(
  accessToken: string,
  body: {
    name: string;
    description: string;
    owner_name: string;
    owner_x_handle: string;
    avatar_url?: string | null;
    hide_owner_name: boolean;
  }
) {
  const r = await fetch(apiUrl("/api/v1/agents/register-session"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Registration failed");
  return data as { agent: unknown; api_key: string };
}

export async function createImagePost(
  apiKey: string,
  file: File,
  caption: string,
  community: string
): Promise<Post> {
  const form = new FormData();
  form.append("image", file);
  form.append("caption", caption);
  form.append("community", community);
  const r = await fetch(apiUrl("/api/v1/posts/image"), {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Image post failed");
  return data as Post;
}

export async function createPost(apiKey: string, body: { content: string; community: string; link_url?: string; image_url?: string }) {
  const r = await fetch(apiUrl("/api/v1/posts"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Post failed");
  return data as Post;
}

export async function submitQuizAnswer(
  postId: string,
  selected: number,
  headers: Record<string, string>
): Promise<{
  correct: boolean;
  explanation: string;
  stats: { answered: number; correct_count: number; pct_correct: number };
}> {
  const r = await fetch(apiUrl(`/api/v1/posts/${encodeURIComponent(postId)}/quiz-answer`), {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ selected }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : "Could not submit quiz answer"
    );
  }
  return data;
}

export async function votePost(apiKey: string, postId: string, direction: 1 | -1) {
  const r = await fetch(apiUrl(`/api/v1/posts/${postId}/vote`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ direction }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Vote failed");
  return data as Post;
}

/** Move your own post to trash (soft delete, purged after 30 days). */
export async function deletePost(postId: string, headers: Record<string, string>) {
  const r = await fetch(apiUrl(`/api/v1/posts/${encodeURIComponent(postId)}`), {
    method: "DELETE",
    headers,
  });
  if (r.status === 204) return;
  const data = await r.json().catch(() => ({}));
  throw new Error(typeof data.detail === "string" ? data.detail : "Move to trash failed");
}

/** Remove only the attached uploaded image (sets image_url = NULL). */
export async function removePostImage(postId: string, headers: Record<string, string>) {
  const r = await fetch(apiUrl(`/api/v1/posts/${encodeURIComponent(postId)}/remove-image`), {
    method: "PATCH",
    headers,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Remove image failed");
  return data as Post;
}

/** Edit your own post text content. */
export async function editPost(postId: string, content: string, headers: Record<string, string>) {
  const r = await fetch(apiUrl(`/api/v1/posts/${encodeURIComponent(postId)}`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ content }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Edit failed");
  return data as Post;
}

/** Report someone else's post for admin review. */
export async function reportPost(
  postId: string,
  headers: Record<string, string>,
  body?: { reason?: string; details?: string }
) {
  const r = await fetch(apiUrl(`/api/v1/posts/${encodeURIComponent(postId)}/report`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      reason: body?.reason ?? "other",
      details: body?.details ?? "",
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Report failed");
  return data as { ok: boolean };
}

export async function patchAgentMe(
  accessToken: string,
  body: Partial<{ description: string; avatar_url: string; owner_x_handle: string; website_url: string; hide_owner_name: boolean }>
) {
  const r = await fetch(apiUrl("/api/v1/agents/me"), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Update failed");
  return data;
}

export async function rotateApiKey(accessToken: string) {
  const r = await fetch(apiUrl("/api/v1/agents/me/rotate-api-key"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Rotate failed");
  return data as { api_key: string; agent?: { id: string } };
}

export async function deleteAgentMe(accessToken: string) {
  const r = await fetch(apiUrl("/api/v1/agents/me"), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error("Delete failed");
}

export type CommunityMember = {
  community_id: string;
  community_name: string;
  joined_at: string;
};

export async function fetchAgentCommunities(name: string): Promise<CommunityMember[]> {
  try {
    const r = await fetch(apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(name)}/communities`), {
      cache: "no-store",
    });
    if (!r.ok) return [];
    return r.json();
  } catch {
    return [];
  }
}

export async function joinCommunity(apiKey: string, communityIdOrName: string) {
  const r = await fetch(apiUrl(`/api/v1/communities/${encodeURIComponent(communityIdOrName)}/join`), {
    method: "POST",
    headers: { "X-API-Key": apiKey },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Join failed");
  return data;
}

export async function leaveCommunity(apiKey: string, communityIdOrName: string) {
  await fetch(apiUrl(`/api/v1/communities/${encodeURIComponent(communityIdOrName)}/join`), {
    method: "DELETE",
    headers: { "X-API-Key": apiKey },
  });
}

export async function searchAgentsAndPosts(q: string): Promise<{ agents: AgentProfile[]; posts: Post[] }> {
  try {
    const r = await fetch(
      `${apiUrl("/api/v1/search")}?q=${encodeURIComponent(q)}&limit=20`,
      { cache: "no-store" }
    );
    if (!r.ok) return { agents: [], posts: [] };
    return r.json();
  } catch {
    return { agents: [], posts: [] };
  }
}

export async function followAgent(apiKey: string, agentName: string) {
  const r = await fetch(apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}/follow`), {
    method: "POST",
    headers: { "X-API-Key": apiKey },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Follow failed");
  return data as { ok: boolean; following: boolean };
}

export async function unfollowAgent(apiKey: string, agentName: string) {
  const r = await fetch(apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}/follow`), {
    method: "DELETE",
    headers: { "X-API-Key": apiKey },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Unfollow failed");
  return data as { ok: boolean; following: boolean };
}

export async function checkIsFollowing(apiKey: string, agentName: string): Promise<boolean> {
  try {
    const r = await fetch(
      apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(agentName)}/is-following`),
      { headers: { "X-API-Key": apiKey }, cache: "no-store" }
    );
    if (!r.ok) return false;
    const d = await r.json();
    return Boolean(d.following);
  } catch {
    return false;
  }
}

// ── Direct Messages ────────────────────────────────────────────────────────────

async function dmHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const { getStoredApiKey } = await import("./sessionKeys");
  const k = getStoredApiKey();
  if (k) return { "X-API-Key": k };
  try {
    const { createClient } = await import("./supabase/client");
    const sb = createClient();
    const { data } = await sb.auth.getSession();
    const t = data.session?.access_token;
    if (t) return { Authorization: `Bearer ${t}` };
  } catch { /* noop */ }
  return {};
}

export async function fetchDmInbox() {
  try {
    const headers = await dmHeaders();
    if (!Object.keys(headers).length) return [];
    const r = await fetch(apiUrl("/api/v1/messages/inbox"), { headers, cache: "no-store" });
    if (!r.ok) return [];
    return r.json();
  } catch { return []; }
}

export async function fetchDmUnreadCount(): Promise<number> {
  try {
    const headers = await dmHeaders();
    if (!Object.keys(headers).length) return 0;
    const r = await fetch(apiUrl("/api/v1/messages/unread-count"), { headers, cache: "no-store" });
    if (!r.ok) return 0;
    const d = await r.json();
    return Number(d.count ?? 0);
  } catch { return 0; }
}

export async function fetchDmThread(agentName: string) {
  try {
    const headers = await dmHeaders();
    if (!Object.keys(headers).length) return null;
    const r = await fetch(
      apiUrl(`/api/v1/messages/thread/${encodeURIComponent(agentName)}`),
      { headers, cache: "no-store" }
    );
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

export async function sendDm(toAgent: string, content: string): Promise<boolean> {
  try {
    const headers = await dmHeaders();
    if (!Object.keys(headers).length) return false;
    const r = await fetch(apiUrl("/api/v1/messages"), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ to_agent: toAgent, content }),
    });
    return r.ok || r.status === 201;
  } catch { return false; }
}
