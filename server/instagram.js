const GRAPH_ORIGIN = "https://graph.instagram.com";
const DEFAULT_API_VERSION = "v25.0";
const CACHE_TTL_MS = 5 * 60 * 1000;
const REFRESH_THROTTLE_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 12 * 1000;
const RECENT_MEDIA_LIMIT = 12;

export const INSTAGRAM_RANGE_DAYS = Object.freeze([7, 14, 30, 90]);
export const ACCOUNT_METRICS = Object.freeze([
  "views",
  "reach",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "replies",
  "profile_links_taps",
  "follows_and_unfollows",
]);
const MEDIA_INSIGHT_METRICS = Object.freeze(["views", "reach", "saved", "shares", "total_interactions"]);
const PROFILE_FIELDS = "id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count,biography,website";
const PROFILE_FALLBACK_FIELDS = "id,username,account_type,followers_count,media_count";
const MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username,like_count,comments_count";
const MEDIA_FALLBACK_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username";

export class InstagramServiceError extends Error {
  constructor(message, { code = "INSTAGRAM_ERROR", statusCode = 502, retryAfter = null } = {}) {
    super(message);
    this.name = "InstagramServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanVersion(value) {
  const version = String(value || DEFAULT_API_VERSION).trim();
  if (!/^v\d+\.\d+$/.test(version)) throw new InstagramServiceError("Instagram API version configuration is invalid.", { code: "INSTAGRAM_CONFIG", statusCode: 503 });
  return version;
}

export function normalizeRange(value) {
  const parsed = Number(value);
  return INSTAGRAM_RANGE_DAYS.includes(parsed) ? parsed : 30;
}

function configured(env) {
  const accessToken = String(env.INSTAGRAM_ACCESS_TOKEN || "").trim();
  const userId = String(env.INSTAGRAM_USER_ID || "").trim();
  if (!accessToken || !userId) {
    throw new InstagramServiceError("Instagram server credentials are not configured.", { code: "INSTAGRAM_NOT_CONFIGURED", statusCode: 503 });
  }
  if (!/^\d+$/.test(userId)) {
    throw new InstagramServiceError("Instagram account configuration is invalid.", { code: "INSTAGRAM_CONFIG", statusCode: 503 });
  }
  return { accessToken, userId, apiVersion: cleanVersion(env.INSTAGRAM_API_VERSION) };
}

function metricWarning(metric, error) {
  return {
    scope: "metric",
    metric,
    code: error.code || "INSTAGRAM_METRIC_UNAVAILABLE",
    message: error.code === "INSTAGRAM_RATE_LIMIT"
      ? `${metric} is temporarily unavailable because Instagram rate-limited the request.`
      : `${metric} is not available for this account or reporting range.`,
  };
}

function mapGraphError(response, payload) {
  const metaCode = Number(payload?.error?.code);
  if (response.status === 401 || metaCode === 190) {
    return new InstagramServiceError("The Instagram connection has expired. Refresh the server access token.", { code: "INSTAGRAM_TOKEN_EXPIRED", statusCode: 401 });
  }
  if (response.status === 429 || [4, 17, 32, 613].includes(metaCode)) {
    return new InstagramServiceError("Instagram temporarily rate-limited analytics requests. Try again later.", { code: "INSTAGRAM_RATE_LIMIT", statusCode: 429, retryAfter: response.headers?.get?.("retry-after") || null });
  }
  if (response.status === 400 || metaCode === 100) {
    return new InstagramServiceError("An Instagram field or metric is unavailable for this account.", { code: "INSTAGRAM_UNSUPPORTED", statusCode: 422 });
  }
  return new InstagramServiceError("Instagram could not complete the analytics request.", { code: "INSTAGRAM_UPSTREAM", statusCode: response.status >= 500 ? 502 : 422 });
}

function normalizeInsightPayload(payload, metric) {
  const item = Array.isArray(payload?.data) ? payload.data.find((entry) => entry?.name === metric) || payload.data[0] : null;
  if (!item) return { name: metric, available: false, value: null, series: [], breakdowns: [] };
  const totalValue = numeric(item.total_value?.value);
  const series = Array.isArray(item.values)
    ? item.values
      .map((entry) => ({ value: numeric(entry?.value), endTime: entry?.end_time || null }))
      .filter((entry) => entry.value !== null && entry.endTime)
    : [];
  const singleValue = Array.isArray(item.values) && item.values.length === 1 ? numeric(item.values[0]?.value) : null;
  const breakdowns = Array.isArray(item.total_value?.breakdowns)
    ? item.total_value.breakdowns.flatMap((breakdown) => Array.isArray(breakdown?.results)
      ? breakdown.results.map((result) => ({
        dimensions: Array.isArray(result.dimension_values) ? result.dimension_values.map(String) : [],
        value: numeric(result.value),
      })).filter((result) => result.value !== null)
      : [])
    : [];
  return {
    name: item.name || metric,
    title: item.title || null,
    period: item.period || null,
    available: totalValue !== null || singleValue !== null || series.length > 0 || breakdowns.length > 0,
    value: totalValue ?? singleValue,
    series,
    breakdowns,
  };
}

function normalizeProfile(payload) {
  return {
    id: payload?.id ? String(payload.id) : null,
    username: payload?.username || null,
    name: payload?.name || null,
    accountType: payload?.account_type || null,
    profilePictureUrl: payload?.profile_picture_url || null,
    followers: numeric(payload?.followers_count),
    follows: numeric(payload?.follows_count),
    mediaCount: numeric(payload?.media_count),
    biography: payload?.biography || null,
    website: payload?.website || null,
  };
}

function normalizeMedia(payload) {
  return (Array.isArray(payload?.data) ? payload.data : []).map((item) => ({
    id: item?.id ? String(item.id) : null,
    caption: item?.caption || "",
    mediaType: item?.media_type || "UNKNOWN",
    mediaUrl: item?.media_url || null,
    thumbnailUrl: item?.thumbnail_url || null,
    permalink: item?.permalink || null,
    timestamp: item?.timestamp || null,
    username: item?.username || null,
    likeCount: numeric(item?.like_count),
    commentsCount: numeric(item?.comments_count),
  })).filter((item) => item.id);
}

function breakdownMap(metric) {
  return Object.fromEntries(metric.breakdowns.map((entry) => [entry.dimensions.join(" / ") || "Unknown", entry.value]));
}

function followerChange(metric) {
  if (!metric?.available) return null;
  const values = breakdownMap(metric);
  let follows = null;
  let unfollows = null;
  Object.entries(values).forEach(([label, value]) => {
    const normalized = label.toLowerCase();
    if (normalized.includes("unfollow")) unfollows = value;
    else if (normalized.includes("follow")) follows = value;
  });
  if (follows === null && unfollows === null) return null;
  return {
    follows,
    unfollows,
    net: follows !== null && unfollows !== null ? follows - unfollows : null,
  };
}

function safeEngagementRate(interactions, reach) {
  if (numeric(interactions) === null || numeric(reach) === null || reach <= 0) return null;
  return Number(((interactions / reach) * 100).toFixed(2));
}

function timestampRange(days, nowMs) {
  const until = Math.floor(nowMs / 1000);
  return { since: until - days * 24 * 60 * 60, until };
}

function publicError(error) {
  if (error instanceof InstagramServiceError) return error;
  if (error?.name === "AbortError") return new InstagramServiceError("Instagram did not respond in time.", { code: "INSTAGRAM_TIMEOUT", statusCode: 504 });
  return new InstagramServiceError("Instagram could not be reached.", { code: "INSTAGRAM_NETWORK", statusCode: 502 });
}

export function createInstagramService({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const cache = new Map();
  const lastForcedRefresh = new Map();

  async function graph(path, search = {}) {
    const { accessToken, apiVersion } = configured(env);
    const url = new URL(`${GRAPH_ORIGIN}/${apiVersion}/${String(path).replace(/^\/+/, "")}`);
    Object.entries(search).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal: controller.signal,
      });
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok || payload?.error) throw mapGraphError(response, payload);
      return payload;
    } catch (error) {
      throw publicError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function memo(key, loader, { force = false, ttl = CACHE_TTL_MS } = {}) {
    const currentTime = now();
    const existing = cache.get(key);
    if (!force && existing?.value && existing.expiresAt > currentTime) return { value: existing.value, cached: true, syncedAt: existing.syncedAt };
    if (!force && existing?.promise) return existing.promise;
    const promise = loader().then((value) => {
      const syncedAt = new Date(now()).toISOString();
      cache.set(key, { value, syncedAt, expiresAt: now() + ttl });
      return { value, cached: false, syncedAt };
    }).catch((error) => {
      if (existing?.value) cache.set(key, existing);
      else cache.delete(key);
      throw error;
    });
    cache.set(key, { ...existing, promise });
    return promise;
  }

  async function profile({ force = false } = {}) {
    const { userId } = configured(env);
    return memo("profile", async () => {
      try {
        return normalizeProfile(await graph(userId, { fields: PROFILE_FIELDS }));
      } catch (error) {
        if (error.code !== "INSTAGRAM_UNSUPPORTED") throw error;
        return normalizeProfile(await graph(userId, { fields: PROFILE_FALLBACK_FIELDS }));
      }
    }, { force });
  }

  async function insightMetric(metric, params) {
    const { userId } = configured(env);
    return normalizeInsightPayload(await graph(`${userId}/insights`, { metric, ...params }), metric);
  }

  async function accountInsights(rangeValue, { force = false } = {}) {
    const range = normalizeRange(rangeValue);
    return memo(`account-insights:${range}`, async () => {
      const period = timestampRange(range, now());
      const warnings = [];
      const metrics = {};
      await Promise.all(ACCOUNT_METRICS.map(async (metric) => {
        try {
          metrics[metric] = await insightMetric(metric, { period: "day", metric_type: "total_value", ...period });
        } catch (error) {
          metrics[metric] = { name: metric, available: false, value: null, series: [], breakdowns: [] };
          warnings.push(metricWarning(metric, error));
        }
      }));

      const trends = {};
      await Promise.all(["reach", "views"].map(async (metric) => {
        try {
          const result = await insightMetric(metric, { period: "day", metric_type: "time_series", ...period });
          if (result.series.length) trends[metric] = result.series;
        } catch (error) {
          if (!warnings.some((warning) => warning.metric === metric)) warnings.push(metricWarning(metric, error));
        }
      }));

      const audience = {};
      const timeframe = range === 14 ? "last_14_days" : range === 30 ? "last_30_days" : range === 90 ? "last_90_days" : null;
      if (timeframe) {
        await Promise.all(["gender", "age", "city", "country"].map(async (breakdown) => {
          try {
            const result = await insightMetric("follower_demographics", { metric_type: "total_value", timeframe, breakdown });
            if (result.breakdowns.length) audience[breakdown] = result.breakdowns.map((entry) => ({ label: entry.dimensions.join(" / ") || "Unknown", value: entry.value }));
          } catch {
            // Demographic availability depends on account size and is intentionally optional.
          }
        }));
      }

      return {
        range,
        metrics,
        trends,
        audience,
        followerChange: followerChange(metrics.follows_and_unfollows),
        engagementRate: safeEngagementRate(metrics.total_interactions?.value, metrics.reach?.value),
        engagementRateFormula: metrics.total_interactions?.value !== null && metrics.reach?.value > 0
          ? "total_interactions / reach × 100"
          : null,
        warnings,
      };
    }, { force });
  }

  async function media({ force = false } = {}) {
    const { userId } = configured(env);
    return memo("media", async () => {
      try {
        return normalizeMedia(await graph(`${userId}/media`, { fields: MEDIA_FIELDS, limit: RECENT_MEDIA_LIMIT }));
      } catch (error) {
        if (error.code !== "INSTAGRAM_UNSUPPORTED") throw error;
        return normalizeMedia(await graph(`${userId}/media`, { fields: MEDIA_FALLBACK_FIELDS, limit: RECENT_MEDIA_LIMIT }));
      }
    }, { force });
  }

  async function mediaInsights(mediaId, { force = false } = {}) {
    const id = String(mediaId || "").trim();
    if (!/^\d+$/.test(id)) throw new InstagramServiceError("Choose a valid Instagram media item.", { code: "INSTAGRAM_MEDIA_ID", statusCode: 400 });
    return memo(`media-insights:${id}`, async () => {
      const metrics = {};
      const warnings = [];
      try {
        const payload = await graph(`${id}/insights`, { metric: MEDIA_INSIGHT_METRICS.join(",") });
        MEDIA_INSIGHT_METRICS.forEach((metric) => { metrics[metric] = normalizeInsightPayload(payload, metric); });
      } catch {
        await Promise.all(MEDIA_INSIGHT_METRICS.map(async (metric) => {
          try { metrics[metric] = await insightMetricForMedia(id, metric); }
          catch (error) {
            metrics[metric] = { name: metric, available: false, value: null, series: [], breakdowns: [] };
            warnings.push(metricWarning(metric, error));
          }
        }));
      }
      return { metrics, warnings };
    }, { force });
  }

  async function insightMetricForMedia(mediaId, metric) {
    return normalizeInsightPayload(await graph(`${mediaId}/insights`, { metric }), metric);
  }

  function combineMediaPerformance(item, insightResult) {
    const metrics = insightResult?.metrics || {};
    const likes = metrics.likes?.value ?? item.likeCount;
    const comments = metrics.comments?.value ?? item.commentsCount;
    const saved = metrics.saved?.value ?? null;
    const shares = metrics.shares?.value ?? null;
    const availableParts = [likes, comments, saved, shares].filter((value) => value !== null);
    const providedInteractions = metrics.total_interactions?.value ?? null;
    return {
      ...item,
      performance: {
        views: metrics.views?.value ?? null,
        reach: metrics.reach?.value ?? null,
        likes,
        comments,
        saved,
        shares,
        interactions: providedInteractions ?? (availableParts.length ? availableParts.reduce((sum, value) => sum + value, 0) : null),
        interactionsDerived: providedInteractions === null && availableParts.length > 0,
      },
    };
  }

  async function dashboard(rangeValue, { force = false } = {}) {
    const range = normalizeRange(rangeValue);
    const key = `dashboard:${range}`;
    const existing = cache.get(key);
    const currentTime = now();
    const lastRefresh = lastForcedRefresh.get(key) || 0;
    if (force && currentTime - lastRefresh < REFRESH_THROTTLE_MS) {
      if (existing?.value) {
        return { ...existing.value, meta: { ...existing.value.meta, cached: true, refreshThrottled: true } };
      }
      throw new InstagramServiceError("Instagram refresh is already in progress. Try again in a moment.", {
        code: "INSTAGRAM_REFRESH_THROTTLED",
        statusCode: 429,
        retryAfter: Math.max(1, Math.ceil((REFRESH_THROTTLE_MS - (currentTime - lastRefresh)) / 1000)),
      });
    }
    if (force) lastForcedRefresh.set(key, currentTime);

    const result = await memo(key, async () => {
      const profileResult = await profile({ force });
      const [insightsResult, mediaResult] = await Promise.all([
        accountInsights(range, { force }),
        media({ force }),
      ]);
      const detailedMedia = await Promise.all(mediaResult.value.map(async (item) => {
        try {
          const result = await mediaInsights(item.id, { force });
          return combineMediaPerformance(item, result.value);
        } catch {
          return combineMediaPerformance(item, null);
        }
      }));
      const warnings = insightsResult.value.warnings;
      const syncedAt = new Date(now()).toISOString();
      const topBy = (metric) => detailedMedia
        .filter((item) => item.performance?.[metric] !== null)
        .sort((a, b) => b.performance[metric] - a.performance[metric]);
      const activity = [
        { id: "sync", type: "sync", title: "Instagram analytics refreshed", detail: `${detailedMedia.length} recent media item${detailedMedia.length === 1 ? "" : "s"} fetched.`, timestamp: syncedAt, tone: "positive" },
        ...(topBy("interactions")[0] ? [{ id: `top-${topBy("interactions")[0].id}`, type: "performance", title: "Current top-performing content", detail: "Ranked by available interactions for recent media.", mediaId: topBy("interactions")[0].id, timestamp: syncedAt, tone: "neutral" }] : []),
        ...warnings.slice(0, 4).map((warning, index) => ({ id: `warning-${index}-${warning.metric}`, type: "api", title: `${warning.metric} unavailable`, detail: warning.message, timestamp: syncedAt, tone: "warning" })),
      ];
      return {
        profile: profileResult.value,
        connection: { status: "connected", provider: "Instagram API with Instagram Login" },
        insights: insightsResult.value,
        media: detailedMedia,
        topContent: {
          reach: topBy("reach"),
          views: topBy("views"),
          interactions: topBy("interactions"),
        },
        activity,
        meta: { range, syncedAt, cached: false, refreshThrottled: false, cacheTtlSeconds: CACHE_TTL_MS / 1000 },
      };
    }, { force });
    return { ...result.value, meta: { ...result.value.meta, cached: result.cached } };
  }

  return {
    profile,
    accountInsights,
    media,
    mediaInsights,
    dashboard,
    clearCache() { cache.clear(); lastForcedRefresh.clear(); },
  };
}

export const instagramService = createInstagramService();
