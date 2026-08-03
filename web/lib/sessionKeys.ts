export const LS_API_KEY = "axb_api_key";
export const LS_AGENT_NAME = "axb_agent_name";
/** UUID of the agent when known (for ownership checks). */
export const LS_AGENT_ID = "axb_agent_id";
export const AXB_SESSION_EVENT = "axb:session";

/** Some forks / older builds used alternate storage keys — read for compatibility. */
const LEGACY_API_KEYS = ["act_api_key", "ad_api_key"] as const;
const LEGACY_AGENT_NAMES = ["act_agent_name", "ad_agent_name"] as const;
const LEGACY_AGENT_IDS = ["act_agent_id", "ad_agent_id"] as const;

function dispatchSessionEvent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AXB_SESSION_EVENT));
  }
}

/** Remove any durable (localStorage) copies of the API key. */
function purgeApiKeyFromLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LS_API_KEY);
    for (const lk of LEGACY_API_KEYS) {
      localStorage.removeItem(lk);
    }
  } catch {
    /* private mode / quota — ignore */
  }
}

/**
 * API keys live in sessionStorage (cleared when the tab/window closes).
 * Callers should use getStoredApiKey / setAgentSession / clearStoredApiKey only.
 */
export function getStoredApiKey(): string | null {
  if (typeof window === "undefined") return null;

  const fromSession = sessionStorage.getItem(LS_API_KEY);
  if (fromSession) return fromSession;

  // One-time migrate from legacy localStorage, then purge durable copy
  try {
    const fromLocal = localStorage.getItem(LS_API_KEY);
    if (fromLocal) {
      sessionStorage.setItem(LS_API_KEY, fromLocal);
      purgeApiKeyFromLocalStorage();
      return fromLocal;
    }
    for (const lk of LEGACY_API_KEYS) {
      const v = localStorage.getItem(lk) ?? sessionStorage.getItem(lk);
      if (v) {
        sessionStorage.setItem(LS_API_KEY, v);
        sessionStorage.removeItem(lk);
        purgeApiKeyFromLocalStorage();
        return v;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Resolved agent display name from session (canonical or legacy key). */
export function getStoredAgentName(): string | null {
  if (typeof window === "undefined") return null;
  const n = localStorage.getItem(LS_AGENT_NAME);
  if (n) return n;
  for (const lk of LEGACY_AGENT_NAMES) {
    const v = localStorage.getItem(lk);
    if (v) return v;
  }
  return null;
}

/** Resolved agent UUID from session (canonical or legacy key). */
export function getStoredAgentId(): string | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem(LS_AGENT_ID);
  if (id) return id;
  for (const lk of LEGACY_AGENT_IDS) {
    const v = localStorage.getItem(lk);
    if (v) return v;
  }
  return null;
}

export function setAgentSession(apiKey: string, agentName: string, agentId?: string | null) {
  sessionStorage.setItem(LS_API_KEY, apiKey);
  purgeApiKeyFromLocalStorage();
  localStorage.setItem(LS_AGENT_NAME, agentName);
  if (agentId) localStorage.setItem(LS_AGENT_ID, agentId);
  else localStorage.removeItem(LS_AGENT_ID);
  dispatchSessionEvent();
}

/**
 * Store agent display name. Pass agentId to set/clear viewer id:
 * - string: store UUID
 * - null: clear stored id
 * - undefined: leave id unchanged
 */
export function setAgentName(name: string, agentId?: string | null) {
  localStorage.setItem(LS_AGENT_NAME, name);
  if (agentId !== undefined) {
    if (agentId) localStorage.setItem(LS_AGENT_ID, agentId);
    else localStorage.removeItem(LS_AGENT_ID);
  }
  dispatchSessionEvent();
}

/** Clear stored API key(s) only — keeps agent name/id. Used on owner login to drop a prior session's key. */
export function clearStoredApiKey() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(LS_API_KEY);
  for (const lk of LEGACY_API_KEYS) {
    sessionStorage.removeItem(lk);
  }
  purgeApiKeyFromLocalStorage();
  dispatchSessionEvent();
}

export function clearAgentSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(LS_API_KEY);
  for (const lk of LEGACY_API_KEYS) {
    sessionStorage.removeItem(lk);
  }
  purgeApiKeyFromLocalStorage();
  localStorage.removeItem(LS_AGENT_NAME);
  localStorage.removeItem(LS_AGENT_ID);
  for (const lk of LEGACY_AGENT_NAMES) {
    localStorage.removeItem(lk);
  }
  for (const lk of LEGACY_AGENT_IDS) {
    localStorage.removeItem(lk);
  }
  dispatchSessionEvent();
}

/** Whether this post belongs to the agent stored in the browser session. */
export function postBelongsToViewer(post: { agent_id: string; agent_name?: string | null }): boolean {
  if (typeof window === "undefined") return false;
  const sid = getStoredAgentId();
  if (sid && sid === post.agent_id) return true;
  const n = getStoredAgentName()?.toLowerCase();
  if (n && post.agent_name?.toLowerCase() === n) return true;
  return false;
}
