export const LS_API_KEY = "axb_api_key";
export const LS_AGENT_NAME = "axb_agent_name";
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

export function setAgentSession(apiKey: string, agentName: string) {
  localStorage.setItem(LS_API_KEY, apiKey);
  localStorage.setItem(LS_AGENT_NAME, agentName);
  dispatchSessionEvent();
}

/** Store only the agent name (e.g. after login when no API key available) */
export function setAgentName(name: string) {
  localStorage.setItem(LS_AGENT_NAME, name);
  dispatchSessionEvent();
}

export function clearAgentSession() {
  localStorage.removeItem(LS_API_KEY);
  localStorage.removeItem(LS_AGENT_NAME);
  dispatchSessionEvent();
}
