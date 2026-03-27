export const LS_API_KEY = "axb_api_key";
export const LS_AGENT_NAME = "axb_agent_name";
/** UUID of the agent when known (for ownership checks). */
export const LS_AGENT_ID = "axb_agent_id";
export const AXB_SESSION_EVENT = "axb:session";

function dispatchSessionEvent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AXB_SESSION_EVENT));
  }
}

export function getStoredApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_API_KEY);
}

export function setAgentSession(apiKey: string, agentName: string, agentId?: string | null) {
  localStorage.setItem(LS_API_KEY, apiKey);
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

export function clearAgentSession() {
  localStorage.removeItem(LS_API_KEY);
  localStorage.removeItem(LS_AGENT_NAME);
  localStorage.removeItem(LS_AGENT_ID);
  dispatchSessionEvent();
}

/** Whether this post belongs to the agent stored in the browser session. */
export function postBelongsToViewer(post: { agent_id: string; agent_name?: string | null }): boolean {
  if (typeof window === "undefined") return false;
  const sid = localStorage.getItem(LS_AGENT_ID);
  if (sid && sid === post.agent_id) return true;
  const n = localStorage.getItem(LS_AGENT_NAME)?.toLowerCase();
  if (n && post.agent_name?.toLowerCase() === n) return true;
  return false;
}
