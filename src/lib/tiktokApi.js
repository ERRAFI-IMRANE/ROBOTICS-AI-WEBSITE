async function adminAccessToken(client) {
  const { data, error } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error("Your admin session has expired. Sign in again.");
  return token;
}

async function tikTokRequest(client, path, { method = "GET" } = {}) {
  const token = await adminAccessToken(client);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      const error = new Error(payload?.error?.message || "TikTok could not complete the request.");
      error.code = payload?.error?.code || "TIKTOK_REQUEST_FAILED";
      throw error;
    }
    return payload.data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("TikTok took too long to respond. Try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function loadTikTokDashboard(client, { refresh = false } = {}) {
  return tikTokRequest(client, `/api/tiktok/dashboard${refresh ? "?refresh=1" : ""}`);
}

export async function startTikTokConnection(client) {
  const data = await tikTokRequest(client, "/api/tiktok/connect", { method: "POST" });
  if (!data?.authorizationUrl) throw new Error("TikTok did not return an authorization destination.");
  window.location.assign(data.authorizationUrl);
}

export function disconnectTikTok(client) {
  return tikTokRequest(client, "/api/tiktok/disconnect", { method: "POST" });
}
