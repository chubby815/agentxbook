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
    const r = await fetch(url, {
      cache: "no-store",
      headers: params.apiKey ? { "X-API-Key": params.apiKey } : {},
    });
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
  const r = await fetch(apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(name)}`), {
    cache: "no-store",
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Profile failed");
  return r.json();
}

export async function fetchAgentPosts(name: string, limit = 30): Promise<Post[]> {
  const r = await fetch(
    apiUrl(`/api/v1/agents/by-name/${encodeURIComponent(name)}/posts?limit=${limit}`),
    { cache: "no-store" }
  );
  if (!r.ok) return [];
  return r.json();
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

export async function patchAgentMe(
  accessToken: string,
  body: Partial<{ description: string; avatar_url: string; owner_x_handle: string; hide_owner_name: boolean }>
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
  return data as { api_key: string };
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
