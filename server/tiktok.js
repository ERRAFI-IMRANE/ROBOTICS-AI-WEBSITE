import { tikTokStore } from "./tiktokStore.js";

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API_ORIGIN = "https://open.tiktokapis.com";
const TOKEN_PATH = "/v2/oauth/token/";
const REVOKE_PATH = "/v2/oauth/revoke/";
const PROFILE_PATH = "/v2/user/info/";
const VIDEOS_PATH = "/v2/video/list/";
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const REFRESH_THROTTLE_MS = 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 10 * 60 * 1000;
const VIDEO_LIMIT = 20;

export const REQUIRED_TIKTOK_SCOPES = Object.freeze([
  "user.info.basic",
  "user.info.profile",
  "user.info.stats",
  "video.list",
]);

const BASIC_PROFILE_FIELDS = ["open_id", "avatar_url", "display_name"];
const EXTENDED_PROFILE_FIELDS = ["profile_web_link", "profile_deep_link", "bio_description", "is_verified", "username"];
const PROFILE_STATS_FIELDS = ["follower_count", "following_count", "likes_count", "video_count"];
const VIDEO_FIELDS = ["id", "create_time", "cover_image_url", "share_url", "video_description", "title", "duration", "like_count", "comment_count", "share_count", "view_count"];

export class TikTokServiceError extends Error {
  constructor(message, { code = "TIKTOK_ERROR", statusCode = 502, retryAfter = null } = {}) {
    super(message);
    this.name = "TikTokServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseScopes(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\s,]+/);
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))];
}

function config(env) {
  const clientKey = String(env.TIKTOK_CLIENT_KEY || "").trim();
  const clientSecret = String(env.TIKTOK_CLIENT_SECRET || "").trim();
  const redirectUri = String(env.TIKTOK_REDIRECT_URI || "").trim();
  const scopes = parseScopes(env.TIKTOK_SCOPES || REQUIRED_TIKTOK_SCOPES.join(","));
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new TikTokServiceError("TikTok server credentials are not configured.", { code: "TIKTOK_NOT_CONFIGURED", statusCode: 503 });
  }
  let redirect;
  try { redirect = new URL(redirectUri); } catch { redirect = null; }
  if (!redirect || redirect.protocol !== "https:" || redirect.search || redirect.hash) {
    throw new TikTokServiceError("TIKTOK_REDIRECT_URI must be a registered static HTTPS URL.", { code: "TIKTOK_REDIRECT_INVALID", statusCode: 503 });
  }
  return { clientKey, clientSecret, redirectUri: redirect.toString(), scopes };
}

function publicError(error) {
  if (error instanceof TikTokServiceError) return error;
  if (error?.name === "AbortError") return new TikTokServiceError("TikTok did not respond in time.", { code: "TIKTOK_TIMEOUT", statusCode: 504 });
  if (error?.code === "TIKTOK_STORAGE_NOT_CONFIGURED") return new TikTokServiceError(error.message, { code: error.code, statusCode: error.statusCode || 503 });
  return new TikTokServiceError("TikTok could not be reached.", { code: "TIKTOK_NETWORK", statusCode: 502 });
}

function responseError(response, payload) {
  const rawCode = typeof payload?.error === "string" ? payload.error : payload?.error?.code;
  const code = String(rawCode ?? "").toLowerCase();
  if (response.status === 429 || code.includes("rate_limit")) {
    return new TikTokServiceError("TikTok temporarily rate-limited this request.", { code: "TIKTOK_RATE_LIMIT", statusCode: 429, retryAfter: response.headers?.get?.("retry-after") || null });
  }
  if (response.status === 401 || code.includes("access_token_invalid") || code.includes("invalid_token")) {
    return new TikTokServiceError("The TikTok access token has expired.", { code: "TIKTOK_TOKEN_EXPIRED", statusCode: 401 });
  }
  if (code.includes("scope") || response.status === 403) {
    return new TikTokServiceError("TikTok did not grant all permissions required for this data.", { code: "TIKTOK_MISSING_SCOPES", statusCode: 403 });
  }
  if (code === "access_denied") {
    return new TikTokServiceError("TikTok authorization was cancelled.", { code: "TIKTOK_AUTH_CANCELLED", statusCode: 400 });
  }
  return new TikTokServiceError("TikTok could not complete the request.", { code: "TIKTOK_UPSTREAM", statusCode: response.status >= 500 ? 502 : 422 });
}

function hasApiError(payload) {
  if (!payload?.error) return false;
  if (typeof payload.error === "string") return true;
  const code = payload.error.code;
  return ![undefined, null, 0, "0", "ok"].includes(code);
}

function normalizeConnectionStatus(row, nowMs) {
  if (!row) return { state: "not_connected", connected: false, scopes: [], missingScopes: [], lastSyncAt: null };
  const scopes = parseScopes(row.scope);
  const missingScopes = REQUIRED_TIKTOK_SCOPES.filter((scope) => !scopes.includes(scope));
  const refreshExpiry = Date.parse(row.refresh_token_expires_at);
  const tokenExpired = row.status === "token_expired" || (Number.isFinite(refreshExpiry) && refreshExpiry <= nowMs);
  const state = tokenExpired ? "token_expired" : row.status === "connection_error" || missingScopes.length ? "connection_error" : "connected";
  return {
    state,
    connected: !tokenExpired,
    scopes,
    missingScopes,
    lastErrorCode: row.last_error_code || null,
    lastSyncAt: row.updated_at || null,
    accessTokenExpiresAt: row.access_token_expires_at || null,
  };
}

function tokenRow(payload, nowMs) {
  const accessToken = String(payload?.access_token || "").trim();
  const refreshToken = String(payload?.refresh_token || "").trim();
  const openId = String(payload?.open_id || "").trim();
  const expiresIn = Number(payload?.expires_in);
  const refreshExpiresIn = Number(payload?.refresh_expires_in);
  if (!accessToken || !refreshToken || !openId || !Number.isFinite(expiresIn) || !Number.isFinite(refreshExpiresIn)) {
    throw new TikTokServiceError("TikTok returned an incomplete authorization response.", { code: "TIKTOK_TOKEN_RESPONSE", statusCode: 502 });
  }
  const scopes = parseScopes(payload.scope);
  const missingScopes = REQUIRED_TIKTOK_SCOPES.filter((scope) => !scopes.includes(scope));
  return {
    open_id: openId,
    access_token: accessToken,
    refresh_token: refreshToken,
    scope: scopes,
    access_token_expires_at: new Date(nowMs + expiresIn * 1000).toISOString(),
    refresh_token_expires_at: new Date(nowMs + refreshExpiresIn * 1000).toISOString(),
    status: missingScopes.length ? "connection_error" : "connected",
    last_error_code: missingScopes.length ? "TIKTOK_MISSING_SCOPES" : null,
  };
}

function normalizeProfile(payload) {
  const user = payload?.data?.user || null;
  if (!user) return null;
  return {
    displayName: user.display_name || null,
    username: user.username || null,
    avatarUrl: user.avatar_url || null,
    profileUrl: user.profile_web_link || user.profile_deep_link || null,
    bio: user.bio_description || null,
    verified: typeof user.is_verified === "boolean" ? user.is_verified : null,
    followers: numeric(user.follower_count),
    following: numeric(user.following_count),
    totalLikes: numeric(user.likes_count),
    videoCount: numeric(user.video_count),
  };
}

function normalizeVideos(payload) {
  return (Array.isArray(payload?.data?.videos) ? payload.data.videos : []).map((video) => {
    const likes = numeric(video.like_count);
    const comments = numeric(video.comment_count);
    const shares = numeric(video.share_count);
    const views = numeric(video.view_count);
    const hasEveryInteraction = likes !== null && comments !== null && shares !== null;
    const engagement = hasEveryInteraction ? likes + comments + shares : null;
    return {
      id: video.id ? String(video.id) : null,
      createdAt: numeric(video.create_time) !== null ? new Date(video.create_time * 1000).toISOString() : null,
      coverUrl: video.cover_image_url || null,
      shareUrl: video.share_url || null,
      description: video.video_description || "",
      title: video.title || "",
      duration: numeric(video.duration),
      views,
      likes,
      comments,
      shares,
      engagement,
      // Current public-video engagement: (likes + comments + shares) / views × 100.
      engagementRate: engagement !== null && views !== null && views > 0 ? Number(((engagement / views) * 100).toFixed(2)) : null,
    };
  }).filter((video) => video.id);
}

function sumAvailable(items, key) {
  const values = items.map((item) => item[key]).filter((value) => numeric(value) !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function createTikTokService({ env = process.env, fetchImpl = globalThis.fetch, store = tikTokStore, now = () => Date.now() } = {}) {
  const cache = new Map();
  const forcedRefreshes = new Map();
  let refreshInFlight = null;

  async function request(pathOrUrl, { method = "GET", accessToken = "", form = null, body = null } = {}) {
    const url = pathOrUrl.startsWith("http") ? new URL(pathOrUrl) : new URL(pathOrUrl, API_ORIGIN);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = { Accept: "application/json" };
    let requestBody;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      requestBody = new URLSearchParams(form).toString();
    } else if (body) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body);
    }
    try {
      const response = await fetchImpl(url, { method, headers, body: requestBody, signal: controller.signal });
      let payload = null;
      try { payload = await response.json(); } catch { payload = {}; }
      if (!response.ok || hasApiError(payload)) throw responseError(response, payload);
      return payload;
    } catch (error) {
      throw publicError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  function connectUrl(state) {
    const { clientKey, redirectUri, scopes } = config(env);
    if (!state) throw new TikTokServiceError("A secure TikTok authorization state is required.", { code: "TIKTOK_STATE_REQUIRED", statusCode: 400 });
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(","));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  }

  async function exchangeCode(code) {
    const authorizationCode = String(code || "").trim();
    if (!authorizationCode) throw new TikTokServiceError("TikTok did not return an authorization code.", { code: "TIKTOK_CODE_MISSING", statusCode: 400 });
    const { clientKey, clientSecret, redirectUri } = config(env);
    const payload = await request(TOKEN_PATH, {
      method: "POST",
      form: { client_key: clientKey, client_secret: clientSecret, code: authorizationCode, grant_type: "authorization_code", redirect_uri: redirectUri },
    });
    const row = tokenRow(payload, now());
    await store.save(row);
    cache.clear();
    forcedRefreshes.clear();
    return normalizeConnectionStatus({ ...row, updated_at: new Date(now()).toISOString() }, now());
  }

  async function status() {
    try {
      return normalizeConnectionStatus(await store.get(), now());
    } catch (error) {
      throw publicError(error);
    }
  }

  async function refreshConnection(row) {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = performRefresh(row).finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  async function performRefresh(row) {
    const { clientKey, clientSecret } = config(env);
    const refreshExpiry = Date.parse(row.refresh_token_expires_at);
    if (!Number.isFinite(refreshExpiry) || refreshExpiry <= now()) {
      await store.update({ status: "token_expired", last_error_code: "TIKTOK_REFRESH_EXPIRED" }).catch(() => null);
      throw new TikTokServiceError("The TikTok connection has expired. Reconnect the account.", { code: "TIKTOK_REFRESH_EXPIRED", statusCode: 401 });
    }
    try {
      const payload = await request(TOKEN_PATH, {
        method: "POST",
        form: { client_key: clientKey, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: row.refresh_token },
      });
      const nextRow = tokenRow(payload, now());
      await store.save(nextRow);
      cache.clear();
      return { ...row, ...nextRow };
    } catch (error) {
      const tokenFailure = ["TIKTOK_TOKEN_EXPIRED", "TIKTOK_UPSTREAM"].includes(error.code) && error.statusCode < 500;
      await store.update({ status: tokenFailure ? "token_expired" : "connection_error", last_error_code: error.code || "TIKTOK_REFRESH_FAILED" }).catch(() => null);
      throw error;
    }
  }

  async function usableConnection() {
    let row;
    try { row = await store.get(); } catch (error) { throw publicError(error); }
    if (!row) throw new TikTokServiceError("TikTok is not connected.", { code: "TIKTOK_NOT_CONNECTED", statusCode: 409 });
    const accessExpiry = Date.parse(row.access_token_expires_at);
    if (!Number.isFinite(accessExpiry) || accessExpiry <= now() + TOKEN_REFRESH_SKEW_MS) row = await refreshConnection(row);
    return row;
  }

  async function withTokenRetry(row, loader) {
    try {
      return await loader(row);
    } catch (error) {
      if (error.code !== "TIKTOK_TOKEN_EXPIRED") throw error;
      const refreshed = await refreshConnection(row);
      return loader(refreshed);
    }
  }

  async function profile(connection = null) {
    const row = connection || await usableConnection();
    const scopes = parseScopes(row.scope);
    const fields = [...BASIC_PROFILE_FIELDS];
    if (scopes.includes("user.info.profile")) fields.push(...EXTENDED_PROFILE_FIELDS);
    if (scopes.includes("user.info.stats")) fields.push(...PROFILE_STATS_FIELDS);
    const url = new URL(PROFILE_PATH, API_ORIGIN);
    url.searchParams.set("fields", [...new Set(fields)].join(","));
    return withTokenRetry(row, async (activeConnection) => normalizeProfile(await request(url.toString(), { accessToken: activeConnection.access_token })));
  }

  async function videos(connection = null) {
    const row = connection || await usableConnection();
    if (!parseScopes(row.scope).includes("video.list")) {
      throw new TikTokServiceError("TikTok did not grant access to public videos.", { code: "TIKTOK_MISSING_SCOPES", statusCode: 403 });
    }
    const url = new URL(VIDEOS_PATH, API_ORIGIN);
    url.searchParams.set("fields", VIDEO_FIELDS.join(","));
    const payload = await withTokenRetry(row, (activeConnection) => request(url.toString(), { method: "POST", accessToken: activeConnection.access_token, body: { max_count: VIDEO_LIMIT } }));
    return {
      items: normalizeVideos(payload),
      hasMore: payload?.data?.has_more === true,
      cursor: numeric(payload?.data?.cursor),
    };
  }

  async function dashboard({ force = false } = {}) {
    const key = "dashboard";
    const currentTime = now();
    const existing = cache.get(key);
    const lastForce = forcedRefreshes.get(key) || 0;
    if (force && currentTime - lastForce < REFRESH_THROTTLE_MS) {
      if (existing?.value) return { ...existing.value, meta: { ...existing.value.meta, cached: true, refreshThrottled: true } };
      throw new TikTokServiceError("TikTok refresh is already in progress.", { code: "TIKTOK_REFRESH_THROTTLED", statusCode: 429, retryAfter: 60 });
    }
    if (!force && existing?.value && existing.expiresAt > currentTime) return { ...existing.value, meta: { ...existing.value.meta, cached: true } };
    if (!force && existing?.promise) return existing.promise;
    if (force) forcedRefreshes.set(key, currentTime);

    const promise = (async () => {
      const connectionState = await status();
      if (!connectionState.connected) {
        return { connection: connectionState, profile: null, videos: [], totals: {}, topVideos: {}, activity: [], errors: [], meta: { syncedAt: null, cached: false, refreshThrottled: false, cacheTtlSeconds: CACHE_TTL_MS / 1000 } };
      }
      let connection;
      try { connection = await usableConnection(); }
      catch (error) {
        const nextStatus = await status().catch(() => ({ state: "connection_error", connected: false, scopes: [], missingScopes: [] }));
        return { connection: nextStatus, profile: null, videos: [], totals: {}, topVideos: {}, activity: [], errors: [{ code: error.code, message: error.message }], meta: { syncedAt: null, cached: false, refreshThrottled: false, cacheTtlSeconds: CACHE_TTL_MS / 1000 } };
      }
      const [profileResult, videosResult] = await Promise.allSettled([profile(connection), videos(connection)]);
      const errors = [];
      if (profileResult.status === "rejected") errors.push({ code: profileResult.reason.code || "TIKTOK_PROFILE_ERROR", message: profileResult.reason.message || "TikTok profile data is unavailable." });
      if (videosResult.status === "rejected") errors.push({ code: videosResult.reason.code || "TIKTOK_VIDEOS_ERROR", message: videosResult.reason.message || "TikTok videos are unavailable." });
      const profileData = profileResult.status === "fulfilled" ? profileResult.value : null;
      const videoItems = videosResult.status === "fulfilled" ? videosResult.value.items : [];
      const syncedAt = new Date(now()).toISOString();
      const topBy = (metric) => [...videoItems].filter((item) => numeric(item[metric]) !== null).sort((a, b) => b[metric] - a[metric]);
      const totals = {
        views: sumAvailable(videoItems, "views"),
        likes: sumAvailable(videoItems, "likes"),
        comments: sumAvailable(videoItems, "comments"),
        shares: sumAvailable(videoItems, "shares"),
        engagement: sumAvailable(videoItems, "engagement"),
      };
      const value = {
        connection: normalizeConnectionStatus({ ...connection, updated_at: syncedAt }, now()),
        profile: profileData,
        videos: videoItems,
        totals,
        topVideos: { views: topBy("views"), likes: topBy("likes"), comments: topBy("comments"), shares: topBy("shares"), engagement: topBy("engagement") },
        activity: [
          { id: "sync", title: "TikTok data refreshed", detail: `${videoItems.length} recent public video${videoItems.length === 1 ? "" : "s"} fetched.`, timestamp: syncedAt, tone: errors.length ? "warning" : "positive" },
          ...errors.map((error, index) => ({ id: `error-${index}`, title: "Some TikTok data is unavailable", detail: error.message, timestamp: syncedAt, tone: "warning" })),
        ],
        errors,
        meta: { syncedAt, cached: false, refreshThrottled: false, cacheTtlSeconds: CACHE_TTL_MS / 1000 },
      };
      cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
      return value;
    })().catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, { ...existing, promise });
    return promise;
  }

  async function disconnect() {
    const row = await store.get();
    if (!row) return { state: "not_connected", connected: false };
    const { clientKey, clientSecret } = config(env);
    let warning = null;
    try {
      await request(REVOKE_PATH, { method: "POST", form: { client_key: clientKey, client_secret: clientSecret, token: row.access_token } });
    } catch {
      warning = "TikTok did not confirm remote revocation, but the local connection was removed.";
    }
    await store.remove();
    cache.clear();
    forcedRefreshes.clear();
    return { state: "not_connected", connected: false, warning };
  }

  return { connectUrl, exchangeCode, status, profile, videos, dashboard, disconnect, clearCache() { cache.clear(); forcedRefreshes.clear(); } };
}

export const tikTokService = createTikTokService();
