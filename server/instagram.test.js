import { test } from "node:test";
import assert from "node:assert/strict";
import { createInstagramService, InstagramServiceError } from "./instagram.js";

const TEST_ENV = {
  INSTAGRAM_ACCESS_TOKEN: "server-test-token",
  INSTAGRAM_USER_ID: "123456",
  INSTAGRAM_APP_ID: "test-app",
  INSTAGRAM_APP_SECRET: "server-test-secret",
  INSTAGRAM_API_VERSION: "v25.0",
};

function jsonResponse(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return headers[name.toLowerCase()] || null; } },
    async json() { return payload; },
  };
}

function instagramFetchMock() {
  const calls = [];
  const totals = {
    views: 120,
    reach: 80,
    accounts_engaged: 31,
    total_interactions: 20,
    likes: 14,
    comments: 3,
    shares: 2,
    saves: 1,
    profile_links_taps: 6,
  };
  const fetchImpl = async (input, options) => {
    const url = input instanceof URL ? input : new URL(input);
    calls.push({ url: url.toString(), authorization: options.headers.Authorization });
    assert.equal(url.origin, "https://graph.instagram.com");
    assert.equal(url.searchParams.has("access_token"), false);
    assert.equal(options.headers.Authorization, `Bearer ${TEST_ENV.INSTAGRAM_ACCESS_TOKEN}`);

    if (url.pathname.endsWith("/123456")) {
      return jsonResponse({ id: "123456", username: "rai.club", account_type: "BUSINESS", profile_picture_url: "https://cdn.example.com/profile.jpg", followers_count: 950, media_count: 42 });
    }
    if (url.pathname.endsWith("/123456/media")) {
      return jsonResponse({ data: [{ id: "9001", caption: "Robot workshop", media_type: "IMAGE", media_url: "https://cdn.example.com/post.jpg", permalink: "https://www.instagram.com/p/example/", timestamp: "2026-09-13T10:00:00+0000", like_count: 10, comments_count: 2 }] });
    }
    if (url.pathname.endsWith("/9001/insights")) {
      const metrics = url.searchParams.get("metric").split(",");
      return jsonResponse({ data: metrics.map((name) => ({ name, total_value: { value: ({ views: 100, reach: 80, saved: 4, shares: 3, total_interactions: 20 })[name] } })) });
    }
    if (url.pathname.endsWith("/123456/insights")) {
      const metric = url.searchParams.get("metric");
      if (metric === "follower_demographics") return jsonResponse({ error: { code: 100 } }, 400);
      if (metric === "replies") return jsonResponse({ error: { code: 100 } }, 400);
      if (metric === "follows_and_unfollows") {
        return jsonResponse({ data: [{ name: metric, total_value: { breakdowns: [{ results: [{ dimension_values: ["FOLLOW"], value: 8 }, { dimension_values: ["UNFOLLOW"], value: 3 }] }] } }] });
      }
      if (url.searchParams.get("metric_type") === "time_series") {
        return jsonResponse({ data: [{ name: metric, values: [{ value: 4, end_time: "2026-09-12T00:00:00+0000" }, { value: 7, end_time: "2026-09-13T00:00:00+0000" }] }] });
      }
      return jsonResponse({ data: [{ name: metric, total_value: { value: totals[metric] } }] });
    }
    return jsonResponse({ error: { code: 100 } }, 404);
  };
  return { calls, fetchImpl };
}

test("Instagram backend verifies profile, account insights, recent media, and media insights", async () => {
  const mock = instagramFetchMock();
  const service = createInstagramService({ env: TEST_ENV, fetchImpl: mock.fetchImpl, now: () => Date.parse("2026-09-14T12:00:00Z") });

  const profile = await service.profile();
  assert.equal(profile.value.username, "rai.club");
  assert.equal(profile.value.followers, 950);

  const insights = await service.accountInsights(30);
  assert.equal(insights.value.metrics.reach.value, 80);
  assert.equal(insights.value.metrics.replies.value, null);
  assert.equal(insights.value.trends.reach.length, 2);
  assert.deepEqual(insights.value.followerChange, { follows: 8, unfollows: 3, net: 5 });
  assert.equal(insights.value.engagementRate, 25);

  const media = await service.media();
  assert.equal(media.value[0].mediaType, "IMAGE");
  const mediaInsights = await service.mediaInsights(media.value[0].id);
  assert.equal(mediaInsights.value.metrics.views.value, 100);
  assert.ok(mock.calls.length > 0);
});

test("Instagram dashboard caches normalized data and never turns an unsupported metric into zero", async () => {
  const mock = instagramFetchMock();
  let currentTime = Date.parse("2026-09-14T12:00:00Z");
  const service = createInstagramService({ env: TEST_ENV, fetchImpl: mock.fetchImpl, now: () => currentTime });
  const first = await service.dashboard(14);
  const callCount = mock.calls.length;
  const cached = await service.dashboard(14);

  assert.equal(cached.meta.cached, true);
  assert.equal(mock.calls.length, callCount);
  assert.equal(first.insights.metrics.replies.available, false);
  assert.equal(first.insights.metrics.replies.value, null);
  assert.equal(first.media[0].performance.interactions, 20);

  currentTime += 61_000;
  await service.dashboard(14, { force: true });
  const refreshedCalls = mock.calls.length;
  const throttled = await service.dashboard(14, { force: true });
  assert.equal(throttled.meta.refreshThrottled, true);
  assert.equal(mock.calls.length, refreshedCalls);
});

test("Instagram backend returns a safe expired-token error", async () => {
  const service = createInstagramService({
    env: TEST_ENV,
    fetchImpl: async () => jsonResponse({ error: { code: 190, message: `Invalid token ${TEST_ENV.INSTAGRAM_ACCESS_TOKEN}` } }, 400),
  });
  await assert.rejects(service.profile(), (error) => {
    assert.ok(error instanceof InstagramServiceError);
    assert.equal(error.code, "INSTAGRAM_TOKEN_EXPIRED");
    assert.equal(error.message.includes(TEST_ENV.INSTAGRAM_ACCESS_TOKEN), false);
    return true;
  });
});

test("Instagram backend rejects missing configuration and invalid ranges safely", async () => {
  const service = createInstagramService({ env: {}, fetchImpl: async () => { throw new Error("should not run"); } });
  await assert.rejects(service.profile(), /not configured/);
  const mock = instagramFetchMock();
  const configuredService = createInstagramService({ env: TEST_ENV, fetchImpl: mock.fetchImpl });
  const dashboard = await configuredService.dashboard(365);
  assert.equal(dashboard.meta.range, 30);
});
