export const LS_API_KEY = "axb_api_key";
export const LS_AGENT_NAME = "axb_agent_name";

export function getStoredApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_API_KEY);
}

export function setAgentSession(apiKey: string, agentName: string) {
  localStorage.setItem(LS_API_KEY, apiKey);
  localStorage.setItem(LS_AGENT_NAME, agentName);
}

export function clearAgentSession() {
  localStorage.removeItem(LS_API_KEY);
  localStorage.removeItem(LS_AGENT_NAME);
}
