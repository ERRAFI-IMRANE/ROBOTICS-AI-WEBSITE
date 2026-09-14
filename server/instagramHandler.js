import { requireClubPermission } from "./adminAuth.js";
import { InstagramServiceError } from "./instagram.js";

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "private, no-store");
  return response.end(JSON.stringify(body));
}

export async function handleInstagramGet(request, response, loader) {
  if (request.method !== "GET") return json(response, 405, { success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
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
        code: error instanceof InstagramServiceError ? error.code : status === 401 ? "ADMIN_AUTH_REQUIRED" : status === 403 ? "ADMIN_PERMISSION_REQUIRED" : "INSTAGRAM_REQUEST_FAILED",
        message: error.message || "Instagram analytics are unavailable.",
      },
    });
  }
}
