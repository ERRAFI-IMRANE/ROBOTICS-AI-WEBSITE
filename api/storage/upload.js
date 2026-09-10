import { requireMediaAdmin } from "../../server/adminAuth.js";
import { IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, matchesImageSignature, uploadToR2 } from "../../server/r2.js";

export const config = { api: { bodyParser: false } };

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  return response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_IMAGE_BYTES) {
      const error = new Error("The image must be 5 MB or smaller.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!size) {
    const error = new Error("Choose an image to upload.");
    error.statusCode = 400;
    throw error;
  }
  return Buffer.concat(chunks);
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { success: false, error: "Method not allowed." });
  const folder = String(request.headers["x-r2-folder"] || "").toUpperCase();
  const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].toLowerCase();
  try {
    await requireMediaAdmin(request, folder);
    if (!IMAGE_EXTENSIONS[contentType]) {
      const error = new Error("Only JPG, PNG, and WebP images are allowed.");
      error.statusCode = 415;
      throw error;
    }
    const declaredSize = Number(request.headers["content-length"] || 0);
    if (declaredSize > MAX_IMAGE_BYTES) {
      const error = new Error("The image must be 5 MB or smaller.");
      error.statusCode = 413;
      throw error;
    }
    const body = await readBody(request);
    if (!matchesImageSignature(body, contentType)) {
      const error = new Error("The uploaded bytes do not match the declared image type.");
      error.statusCode = 415;
      throw error;
    }
    const result = await uploadToR2(body, folder, contentType);
    return json(response, 201, { success: true, ...result });
  } catch (error) {
    return json(response, error.statusCode || 500, { success: false, error: error.message || "R2 upload failed." });
  }
}
