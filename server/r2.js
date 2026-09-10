import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { isAllowedMediaFolder } from "./adminAuth.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

export function matchesImageSignature(body, contentType) {
  if (!Buffer.isBuffer(body)) return false;
  if (contentType === "image/jpeg") return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (contentType === "image/png") return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/webp") return body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP";
  return false;
}

let r2Client;

function config() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket || !publicUrl) {
    throw new Error("Cloudflare R2 server environment variables are incomplete.");
  }
  if (bucket !== "roboticsai-media") throw new Error("R2_BUCKET_NAME must be roboticsai-media.");
  return { accessKeyId, secretAccessKey, endpoint, bucket, publicUrl: publicUrl.replace(/\/+$/, "") };
}

function client() {
  if (r2Client) return r2Client;
  const value = config();
  r2Client = new S3Client({
    region: "auto",
    endpoint: value.endpoint,
    credentials: { accessKeyId: value.accessKeyId, secretAccessKey: value.secretAccessKey },
  });
  return r2Client;
}

export function buildPublicUrl(objectKey) {
  const { publicUrl } = config();
  return `${publicUrl}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

export function publicUrlToObjectKey(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const { publicUrl } = config();
    const base = new URL(`${publicUrl}/`);
    const candidate = new URL(value);
    const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
    if (candidate.origin !== base.origin || !candidate.pathname.startsWith(basePath)) return null;
    const key = decodeURIComponent(candidate.pathname.slice(basePath.length));
    const folder = key.split("/", 1)[0];
    if (!key || key.includes("..") || !isAllowedMediaFolder(folder)) return null;
    return key;
  } catch {
    return null;
  }
}

export async function uploadToR2(body, folder, contentType) {
  const extension = IMAGE_EXTENSIONS[contentType];
  if (!isAllowedMediaFolder(folder) || !extension) throw new Error("Invalid media upload.");
  const key = `${folder}/${randomUUID()}.${extension}`;
  const { bucket } = config();
  await client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return { key, url: buildPublicUrl(key) };
}

export async function deleteFromR2(objectKey) {
  const folder = String(objectKey || "").split("/", 1)[0];
  if (!objectKey || objectKey.includes("..") || !isAllowedMediaFolder(folder)) {
    throw new Error("Invalid R2 object key.");
  }
  const { bucket } = config();
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}
