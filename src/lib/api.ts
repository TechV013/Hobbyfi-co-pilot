const API_BASE = "";
let authToken: string | null = null;

export function setAuthToken(token: string) {
  authToken = token;
}

export function getAuthToken(): string | null {
  if (typeof window !== "undefined") {
    return authToken || localStorage.getItem("hobbyfi_token");
  }
  return null;
}

export async function demoLogin(vendorId: string): Promise<{ token: string; vendorName: string }> {
  const res = await fetch(`${API_BASE}/api/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vendorId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Login failed" } }));
    throw new Error(err.error?.message || "Login failed");
  }

  return res.json();
}

export async function sendChatMessage(message: string, conversationId: string, signal?: AbortSignal) {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/copilot/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, conversationId }),
    signal,
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("SESSION_EXPIRED");
    if (res.status === 429) throw new Error("RATE_LIMITED");
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function approveAction(previewId: string, decision: "approve" | "reject", signal?: AbortSignal) {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/copilot/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ previewId, decision }),
    signal,
  });

  if (!res.ok) {
    if (res.status === 409) throw new Error("ALREADY_PROCESSED");
    if (res.status === 410) throw new Error("EXPIRED");
    if (res.status === 401) throw new Error("SESSION_EXPIRED");
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  return res.json();
}
