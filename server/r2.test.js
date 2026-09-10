import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertMediaPermission } from "./adminAuth.js";
import { buildPublicUrl, matchesImageSignature, publicUrlToObjectKey } from "./r2.js";

const TEST_ENV = {
  R2_ACCESS_KEY_ID: "test-access",
  R2_SECRET_ACCESS_KEY: "test-secret",
  R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  R2_BUCKET_NAME: "roboticsai-media",
  R2_PUBLIC_URL: "https://media.example.com/assets",
};
Object.assign(process.env, TEST_ENV);

test("R2 URLs round-trip only for the configured media host and folders", () => {
  assert.equal(buildPublicUrl("EVENTS/abc.webp"), "https://media.example.com/assets/EVENTS/abc.webp");
  assert.equal(publicUrlToObjectKey("https://media.example.com/assets/AVATARS/abc.jpg"), "AVATARS/abc.jpg");
  assert.equal(publicUrlToObjectKey("https://other.example.com/assets/AVATARS/abc.jpg"), null);
  assert.equal(publicUrlToObjectKey("https://media.example.com/assets/PRIVATE/abc.jpg"), null);
});

test("media authorization follows granular admin permissions", () => {
  const owner = { app_metadata: { club_admin: true, club_role: "owner", club_permissions: [] } };
  const teamOfficer = { app_metadata: { club_admin: true, club_permissions: ["team"] } };
  assert.doesNotThrow(() => assertMediaPermission(owner, "EVENTS"));
  assert.doesNotThrow(() => assertMediaPermission(teamOfficer, "PHOTOS"));
  assert.throws(() => assertMediaPermission(teamOfficer, "EVENTS"), /events permission/);
  assert.throws(() => assertMediaPermission(teamOfficer, "OTHER"), /Only EVENTS/);
});

test("declared image types must match their file signatures", () => {
  assert.equal(matchesImageSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), true);
  assert.equal(matchesImageSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
  assert.equal(matchesImageSignature(Buffer.from("RIFF1234WEBP"), "image/webp"), true);
  assert.equal(matchesImageSignature(Buffer.from("not an image"), "image/png"), false);
});

test("browser code contains no R2 credentials or Supabase Storage writes", () => {
  const mediaClient = readFileSync(new URL("../src/lib/mediaStorage.js", import.meta.url), "utf8");
  const teamAdmin = readFileSync(new URL("../src/components/Admin/AdminTeam.jsx", import.meta.url), "utf8");
  const eventAdmin = readFileSync(new URL("../src/components/Admin/AdminEvents.jsx", import.meta.url), "utf8");
  const browserCode = `${mediaClient}\n${teamAdmin}\n${eventAdmin}`;
  assert.doesNotMatch(browserCode, /R2_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|ENDPOINT)/);
  assert.doesNotMatch(browserCode, /supabase\.storage|\.getPublicUrl\(/);
  assert.match(mediaClient, /\/api\/storage\/upload/);
  assert.match(mediaClient, /\/api\/storage\/delete/);
});
