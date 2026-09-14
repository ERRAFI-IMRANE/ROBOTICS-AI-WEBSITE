import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTikTokService, TikTokServiceError } from "./tiktok.js";
import { callbackRedirect, createOAuthState, oauthStateCookie, verifyOAuthState } from "./tiktokHttp.js";

const TEST_ENV = {
  TIKTOK_CLIENT_KEY: "test-client-key",
  TIKTOK_CLIENT_SECRET: "test-client-secret",
  TIKTOK_REDIRECT_URI: "https://club.example/api/tiktok/callback",
  TIKTOK_SCOPES: "user.info.basic,user.info.profile,user.info.stats,video.list",
};

function response(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return headers[name.toLowerCase()] || null; } },
    async json() { return payload; },
  };
}

function memoryStore(initial = null) {
  let row = initial ? { ...initial } : null;
  return {
    async get() { return row ? { ...row } : null; },
    async save(next) {
      row = { ...row, ...next, created_at: row?.created_at || "2026-09-14T10:00:00.000Z", updated_at: "2026-09-14T10:00:00.000Z" };
      return { ...row };
    },
    async update(values) { row = row ? { ...row, ...values } : null; return row ? { ...row } : null; },
    async remove() { row = null; },
    inspect() { return row ? { ...row } : null; },
  };
}

function tikTokFetchMock() {
  const calls = [];
  let refreshCount = 0;
  const fetchImpl = async (input, options = {}) => {
    const url = input instanceof URL ? input : new URL(input);
    const body = new URLSearchParams(options.body || "");
    calls.push({ url: url.toString(), method: options.method, authorization: options.headers?.Authorization, body });
    assert.equal(url.origin, "https://open.tiktokapis.com");

    if (url.pathname === "/v2/oauth/token/") {
      assert.equal(body.get("client_secret"), TEST_ENV.TIKTOK_CLIENT_SECRET);
      const refreshing = body.get("grant_type") === "refresh_token";
      if (refreshing) refreshCount += 1;
      return response({
        access_token: refreshing ? `access-refreshed-${refreshCount}` : "access-initial",
        refresh_token: refreshing ? `refresh-rotated-${refreshCount}` : "refresh-initial",
        open_id: "open-user-1",
        scope: TEST_ENV.TIKTOK_SCOPES,
        expires_in: 86_400,
        refresh_expires_in: 31_536_000,
        token_type: "Bearer",
      });
    }
    if (url.pathname === "/v2/user/info/") {
      assert.match(options.headers.Authorization, /^Bearer access-/);
      return response({ data: { user: { display_name: "RAI Club", username: "robotics.ai.club", avatar_url: "https://cdn.example/avatar.jpg", profile_web_link: "https://www.tiktok.com/@robotics.ai.club", is_verified: false, follower_count: 1200, following_count: 88, likes_count: 9800, video_count: 31 } }, error: { code: "ok", message: "" } });
    }
    if (url.pathname === "/v2/video/list/") {
      assert.match(options.headers.Authorization, /^Bearer access-/);
      return response({ data: { videos: [
        { id: "701", create_time: 1789380000, cover_image_url: "https://cdn.example/701.jpg", share_url: "https://www.tiktok.com/@robotics.ai.club/video/701", title: "Robot demo", duration: 22, view_count: 1000, like_count: 100, comment_count: 10, share_count: 5 },
        { id: "702", create_time: 1789293600, cover_image_url: "https://cdn.example/702.jpg", share_url: "https://www.tiktok.com/@robotics.ai.club/video/702", video_description: "AI workshop", duration: 31, view_count: 500, like_count: 40, comment_count: 4, share_count: 1 },
      ], has_more: false, cursor: 1789293600000 }, error: { code: "ok", message: "" } });
    }
    if (url.pathname === "/v2/oauth/revoke/") return response({});
    return response({ error: { code: "invalid_request" } }, 400);
  };
  return { calls, fetchImpl, get refreshCount() { return refreshCount; } };
}

test("TikTok authorization URL uses secure v2 OAuth parameters without exposing the client secret", () => {
  const service = createTikTokService({ env: TEST_ENV, store: memoryStore(), fetchImpl: async () => response({}) });
  const url = new URL(service.connectUrl("secure-state"));
  assert.equal(url.origin, "https://www.tiktok.com");
  assert.equal(url.pathname, "/v2/auth/authorize/");
  assert.equal(url.searchParams.get("client_key"), TEST_ENV.TIKTOK_CLIENT_KEY);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), TEST_ENV.TIKTOK_REDIRECT_URI);
  assert.equal(url.searchParams.get("state"), "secure-state");
  assert.equal(url.toString().includes(TEST_ENV.TIKTOK_CLIENT_SECRET), false);
});

test("TikTok code exchange stores tokens server-side and profile/video metrics load", async () => {
  const store = memoryStore();
  const mock = tikTokFetchMock();
  const now = () => Date.parse("2026-09-14T10:00:00Z");
  const service = createTikTokService({ env: TEST_ENV, store, fetchImpl: mock.fetchImpl, now });
  const connection = await service.exchangeCode("single-use-code");
  assert.equal(connection.state, "connected");
  assert.equal(store.inspect().access_token, "access-initial");

  const dashboard = await service.dashboard();
  assert.equal(dashboard.profile.displayName, "RAI Club");
  assert.equal(dashboard.profile.followers, 1200);
  assert.equal(dashboard.videos.length, 2);
  assert.equal(dashboard.totals.views, 1500);
  assert.equal(dashboard.totals.likes, 140);
  assert.equal(dashboard.videos[0].engagement, 115);
  assert.equal(dashboard.videos[0].engagementRate, 11.5);
  assert.equal(dashboard.topVideos.views[0].id, "701");
  assert.equal(JSON.stringify(dashboard).includes("access-initial"), false);
  assert.equal(JSON.stringify(dashboard).includes("refresh-initial"), false);
});

test("TikTok refreshes an expiring access token and rotates the refresh token", async () => {
  const store = memoryStore({
    provider: "tiktok", open_id: "open-user-1", access_token: "access-old", refresh_token: "refresh-old", scope: TEST_ENV.TIKTOK_SCOPES.split(","),
    access_token_expires_at: "2026-09-14T10:05:00.000Z", refresh_token_expires_at: "2027-09-14T10:00:00.000Z", status: "connected", updated_at: "2026-09-14T09:00:00.000Z",
  });
  const mock = tikTokFetchMock();
  const service = createTikTokService({ env: TEST_ENV, store, fetchImpl: mock.fetchImpl, now: () => Date.parse("2026-09-14T10:00:00Z") });
  const profile = await service.profile();
  assert.equal(profile.displayName, "RAI Club");
  assert.equal(mock.refreshCount, 1);
  assert.equal(store.inspect().access_token, "access-refreshed-1");
  assert.equal(store.inspect().refresh_token, "refresh-rotated-1");
});

test("TikTok retries once with a refreshed token when the API rejects an apparently valid access token", async () => {
  const store = memoryStore({
    provider: "tiktok", open_id: "open-user-1", access_token: "access-revoked", refresh_token: "refresh-valid", scope: TEST_ENV.TIKTOK_SCOPES.split(","),
    access_token_expires_at: "2026-09-15T10:00:00.000Z", refresh_token_expires_at: "2027-09-14T10:00:00.000Z", status: "connected", updated_at: "2026-09-14T09:00:00.000Z",
  });
  const baseMock = tikTokFetchMock();
  let rejectedOnce = false;
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    if (url.pathname === "/v2/user/info/" && !rejectedOnce) {
      rejectedOnce = true;
      return response({ error: { code: "access_token_invalid", message: "expired" } }, 401);
    }
    return baseMock.fetchImpl(input, options);
  };
  const service = createTikTokService({ env: TEST_ENV, store, fetchImpl, now: () => Date.parse("2026-09-14T10:00:00Z") });
  const profile = await service.profile();
  assert.equal(profile.displayName, "RAI Club");
  assert.equal(baseMock.refreshCount, 1);
  assert.equal(store.inspect().access_token, "access-refreshed-1");
});

test("TikTok missing fields stay unavailable rather than becoming fake zeroes", async () => {
  const store = memoryStore({
    provider: "tiktok", open_id: "open-user-1", access_token: "access-valid", refresh_token: "refresh-valid", scope: TEST_ENV.TIKTOK_SCOPES.split(","),
    access_token_expires_at: "2026-09-15T10:00:00.000Z", refresh_token_expires_at: "2027-09-14T10:00:00.000Z", status: "connected", updated_at: "2026-09-14T09:00:00.000Z",
  });
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.pathname === "/v2/user/info/") return response({ data: { user: { display_name: "RAI Club" } }, error: { code: "ok" } });
    return response({ data: { videos: [{ id: "1", create_time: 1789380000, title: "No public counters returned" }] }, error: { code: "ok" } });
  };
  const service = createTikTokService({ env: TEST_ENV, store, fetchImpl, now: () => Date.parse("2026-09-14T10:00:00Z") });
  const dashboard = await service.dashboard();
  assert.equal(dashboard.profile.followers, null);
  assert.equal(dashboard.videos[0].views, null);
  assert.equal(dashboard.videos[0].engagementRate, null);
  assert.equal(dashboard.totals.views, null);
});

test("TikTok OAuth state cookie is HTTP-only and state verification is timing-safe", () => {
  const state = createOAuthState();
  const cookie = oauthStateCookie(state);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(verifyOAuthState({ headers: { cookie: cookie.split(";")[0] } }, state), true);
  assert.equal(verifyOAuthState({ headers: { cookie: cookie.split(";")[0] } }, `${state}x`), false);
  const redirect = new URL(callbackRedirect(TEST_ENV, "connected"));
  assert.equal(redirect.origin, "https://club.example");
  assert.equal(redirect.searchParams.get("adminTab"), "social_media");
  assert.equal(redirect.searchParams.get("platform"), "tiktok");
});

test("TikTok upstream errors are sanitized and do not echo tokens or secrets", async () => {
  const store = memoryStore({
    provider: "tiktok", open_id: "open-user-1", access_token: "private-access", refresh_token: "private-refresh", scope: TEST_ENV.TIKTOK_SCOPES.split(","),
    access_token_expires_at: "2026-09-15T10:00:00.000Z", refresh_token_expires_at: "2027-09-14T10:00:00.000Z", status: "connected",
  });
  const service = createTikTokService({ env: TEST_ENV, store, fetchImpl: async () => response({ error: { code: "access_token_invalid", message: "private-access test-client-secret" } }, 401), now: () => Date.parse("2026-09-14T10:00:00Z") });
  await assert.rejects(service.profile(), (error) => {
    assert.ok(error instanceof TikTokServiceError);
    assert.equal(error.code, "TIKTOK_TOKEN_EXPIRED");
    assert.equal(error.message.includes("private-access"), false);
    assert.equal(error.message.includes(TEST_ENV.TIKTOK_CLIENT_SECRET), false);
    return true;
  });
});

test("TikTok token migration denies browser roles and API routes use the admin permission boundary", () => {
  const migration = readFileSync(new URL("../supabase/migration_tiktok_oauth_connection.sql", import.meta.url), "utf8");
  const handler = readFileSync(new URL("./tiktokHttp.js", import.meta.url), "utf8");
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.social_oauth_connections FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT ALL ON TABLE public\.social_oauth_connections TO service_role/);
  assert.match(handler, /requireClubPermission\(request, "social_media"\)/);
});
