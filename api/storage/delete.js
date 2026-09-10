import { assertMediaPermission, requireClubAdmin } from "../../server/adminAuth.js";
import { deleteFromR2, publicUrlToObjectKey } from "../../server/r2.js";

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  return response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) {
      const error = new Error("The delete request is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export default async function handler(request, response) {
  if (request.method !== "DELETE") return json(response, 405, { success: false, error: "Method not allowed." });
  try {
    const user = await requireClubAdmin(request);
    const body = await readJsonBody(request);
    const url = body.url;
    const key = publicUrlToObjectKey(url);
    if (!key) return json(response, 200, { success: true, deleted: false, external: true });
    const folder = key.split("/", 1)[0];
    assertMediaPermission(user, folder);
    await deleteFromR2(key);
    return json(response, 200, { success: true, deleted: true, key });
  } catch (error) {
    return json(response, error.statusCode || 500, { success: false, error: error.message || "R2 deletion failed." });
  }
}
