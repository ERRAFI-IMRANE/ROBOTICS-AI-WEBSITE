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

function configurationError(message) {
  const error = new Error(message);
  error.name = "R2ConfigurationError";
  error.statusCode = 500;
  return error;
}

export function normalizeR2Error(error, action = "upload") {
  if (error?.name === "R2ConfigurationError") return error;

  const code = String(error?.name || error?.Code || error?.code || "");
  const messages = {
    AccessDenied: "Cloudflare R2 rejected the request. Give the R2 API token Object Read & Write access to the roboticsai-media bucket.",
    InvalidAccessKeyId: "The Cloudflare R2 access key is invalid. Update R2_ACCESS_KEY_ID in Vercel and redeploy.",
    InvalidToken: "The Cloudflare R2 credentials are invalid or expired. Replace the R2 access key pair in Vercel and redeploy.",
    SignatureDoesNotMatch: "The Cloudflare R2 secret key does not match the access key or endpoint. Update the R2 credentials in Vercel and redeploy.",
    NoSuchBucket: "The roboticsai-media bucket was not found for this Cloudflare account. Check R2_ENDPOINT and R2_BUCKET_NAME in Vercel.",
    NotFound: "The requested Cloudflare R2 bucket or object was not found.",
    TimeoutError: "Cloudflare R2 did not respond in time. Try again, then check the R2 endpoint if the problem continues.",
    RequestTimeout: "Cloudflare R2 did not respond in time. Try again, then check the R2 endpoint if the problem continues.",
  };
  const networkCodes = new Set(["NetworkingError", "ENOTFOUND", "ECONNREFUSED", "ECONNRESET"]);
  const message = messages[code]
    || (networkCodes.has(code)
      ? "The server could not reach Cloudflare R2. Check R2_ENDPOINT in Vercel."
      : `Cloudflare R2 ${action} failed${code ? ` (${code})` : ""}. Check the Vercel function logs and R2 credentials.`);
  const normalized = new Error(message);
  normalized.name = "R2RequestError";
  normalized.statusCode = 502;
  return normalized;
}

function config() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  const missing = [
    ["R2_ACCESS_KEY_ID", accessKeyId],
    ["R2_SECRET_ACCESS_KEY", secretAccessKey],
    ["R2_ENDPOINT", endpoint],
    ["R2_BUCKET_NAME", bucket],
    ["R2_PUBLIC_URL", publicUrl],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw configurationError(`Cloudflare R2 is not configured in Vercel. Missing: ${missing.join(", ")}.`);
  }
  if (bucket !== "roboticsai-media") throw configurationError("R2_BUCKET_NAME must be roboticsai-media.");
  let endpointUrl;
  let publicBaseUrl;
  try {
    endpointUrl = new URL(endpoint);
    publicBaseUrl = new URL(publicUrl);
  } catch {
    throw configurationError("R2_ENDPOINT or R2_PUBLIC_URL is not a valid URL.");
  }
  if (
    endpointUrl.protocol !== "https:"
    || !endpointUrl.hostname.endsWith(".r2.cloudflarestorage.com")
    || !["", "/"].includes(endpointUrl.pathname)
  ) {
    throw configurationError("R2_ENDPOINT must be the Cloudflare S3 API URL: https://<ACCOUNT_ID>.r2.cloudflarestorage.com");
  }
  if (publicBaseUrl.protocol !== "https:" || !publicBaseUrl.hostname) {
    throw configurationError("R2_PUBLIC_URL must be a valid HTTPS public bucket or custom-domain URL.");
  }
  return {
    accessKeyId,
    secretAccessKey,
    endpoint: endpointUrl.origin,
    bucket,
    publicUrl: publicUrl.replace(/\/+$/, ""),
  };
}

function client() {
  if (r2Client) return r2Client;
  const value = config();
  r2Client = new S3Client({
    region: "auto",
    endpoint: value.endpoint,
    forcePathStyle: true,
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
  try {
    await client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }));
  } catch (error) {
    throw normalizeR2Error(error, "upload");
  }
  return { key, url: buildPublicUrl(key) };
}

export async function deleteFromR2(objectKey) {
  const folder = String(objectKey || "").split("/", 1)[0];
  if (!objectKey || objectKey.includes("..") || !isAllowedMediaFolder(folder)) {
    throw new Error("Invalid R2 object key.");
  }
  const { bucket } = config();
  try {
    await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  } catch (error) {
    throw normalizeR2Error(error, "delete");
  }
}
