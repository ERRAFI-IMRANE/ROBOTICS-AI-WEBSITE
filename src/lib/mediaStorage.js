const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_FOLDERS = new Set(["EVENTS", "AVATARS", "PHOTOS"]);

async function accessToken(client) {
  const { data, error } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error("Your admin session expired. Sign in again before managing images.");
  return token;
}

async function readResponse(response, fallback) {
  let result;
  try { result = await response.json(); } catch { result = null; }
  if (!response.ok || !result?.success) throw new Error(result?.error || fallback);
  return result;
}

export function validateImageFile(file) {
  if (!file || !IMAGE_TYPES.has(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error("Choose an image no larger than 5 MB.");
}

export async function uploadMedia(client, file, folder) {
  const normalizedFolder = String(folder || "").toUpperCase();
  validateImageFile(file);
  if (!ALLOWED_FOLDERS.has(normalizedFolder)) throw new Error("This media folder is not allowed.");
  const token = await accessToken(client);
  const response = await fetch("/api/storage/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type,
      "X-R2-Folder": normalizedFolder,
    },
    body: file,
  });
  return readResponse(response, "The image could not be uploaded to Cloudflare R2.");
}

export async function deleteMediaUrl(client, url) {
  if (!url || typeof url !== "string" || url.startsWith("/")) return { deleted: false, external: true };
  const token = await accessToken(client);
  const response = await fetch("/api/storage/delete", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return readResponse(response, "The old image could not be removed from Cloudflare R2.");
}

export async function deleteMediaUrls(client, urls) {
  const uniqueUrls = [...new Set((urls || []).filter(Boolean))];
  return Promise.all(uniqueUrls.map((url) => deleteMediaUrl(client, url)));
}
