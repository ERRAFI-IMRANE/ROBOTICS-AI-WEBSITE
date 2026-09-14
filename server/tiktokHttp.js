import { randomBytes, timingSafeEqual } from "node:crypto";
import { requireClubPermission } from "./adminAuth.js";
import { TikTokServiceError } from "./tiktok.js";

const STATE_COOKIE = "rai_tiktok_oauth_state";

export function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "private, no-store");
  return response.end(JSON.stringify(body));
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function oauthStateCookie(state) {
  return `${STATE_COOKIE}=${encodeURIComponent(state)}; Max-Age=600; Path=/api/tiktok; HttpOnly; Secure; SameSite=Lax`;
}

export function clearOAuthStateCookie() {
  return `${STATE_COOKIE}=; Max-Age=0; Path=/api/tiktok; HttpOnly; Secure; SameSite=Lax`;
}

function cookies(request) {
  return Object.fromEntries(String(request.headers?.cookie || "").split(";").flatMap((entry) => {
    const index = entry.indexOf("=");
    if (index < 0) return [];
    const key = entry.slice(0, index).trim();
    try { return [[key, decodeURIComponent(entry.slice(index + 1).trim())]]; } catch { return []; }
  }));
}

export function verifyOAuthState(request, receivedState) {
  const expected = cookies(request)[STATE_COOKIE] || "";
  const received = String(receivedState || "");
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function callbackRedirect(env, result, reason = "") {
  let origin = "https://www.roboticsai-ests.com";
  try { origin = new URL(env.TIKTOK_REDIRECT_URI).origin; } catch { /* Config errors are rendered after returning to admin. */ }
  const url = new URL("/", origin);
  url.searchParams.set("view", "admin");
  url.searchParams.set("adminTab", "social_media");
  url.searchParams.set("platform", "tiktok");
  url.searchParams.set("tiktok", result);
  if (reason) url.searchParams.set("reason", reason);
  return url.toString();
}

export async function handleTikTokAdmin(request, response, { methods = ["GET"], loader }) {
  if (!methods.includes(request.method)) return json(response, 405, { success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
  try {
    await requireClubPermission(request, "social_media");
    const data = await loader();
    return json(response, 200, { success: true, data });
  } catch (error) {
    const status = error.statusCode || 500;
    if (error.retryAfter) response.setHeader("Retry-After", String(error.retryAfter));
    return json(response, status, {
      success: false,
      error: {
        code: error instanceof TikTokServiceError ? error.code : status === 401 ? "ADMIN_AUTH_REQUIRED" : status === 403 ? "ADMIN_PERMISSION_REQUIRED" : "TIKTOK_REQUEST_FAILED",
        message: error.message || "TikTok is unavailable.",
      },
    });
  }
}
