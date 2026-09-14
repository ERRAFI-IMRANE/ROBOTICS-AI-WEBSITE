export const INSTAGRAM_RANGE_OPTIONS = Object.freeze([
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
]);

async function adminAccessToken(client) {
  const { data, error } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error("Your admin session has expired. Sign in again.");
  return token;
}

export async function loadInstagramDashboard(client, range = 30, { refresh = false } = {}) {
  const token = await adminAccessToken(client);
  const query = new URLSearchParams({ range: String(range) });
  if (refresh) query.set("refresh", "1");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`/api/instagram/dashboard?${query}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !payload.data) {
      const error = new Error(payload?.error?.message || "Instagram analytics could not be loaded.");
      error.code = payload?.error?.code || "INSTAGRAM_REQUEST_FAILED";
      throw error;
    }
    return payload.data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Instagram analytics took too long to respond. Try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
