import { tikTokService } from "../../server/tiktok.js";
import { callbackRedirect, clearOAuthStateCookie, verifyOAuthState } from "../../server/tiktokHttp.js";

function redirect(response, location) {
  response.statusCode = 302;
  response.setHeader("Location", location);
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Set-Cookie", clearOAuthStateCookie());
  return response.end();
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    return response.end("Method not allowed");
  }
  const query = request.query || {};
  if (!verifyOAuthState(request, query.state)) {
    return redirect(response, callbackRedirect(process.env, "error", "invalid_state"));
  }
  if (query.error) {
    const cancelled = query.error === "access_denied" || query.error === "user_cancelled";
    return redirect(response, callbackRedirect(process.env, cancelled ? "cancelled" : "error", cancelled ? "authorization_cancelled" : "authorization_failed"));
  }
  try {
    await tikTokService.exchangeCode(query.code);
    return redirect(response, callbackRedirect(process.env, "connected"));
  } catch (error) {
    const safeReason = error?.code === "TIKTOK_MISSING_SCOPES" ? "missing_scopes" : "connection_failed";
    return redirect(response, callbackRedirect(process.env, "error", safeReason));
  }
}
