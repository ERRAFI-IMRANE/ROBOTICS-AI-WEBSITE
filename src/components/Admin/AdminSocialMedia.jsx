import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INSTAGRAM_RANGE_OPTIONS, loadInstagramDashboard } from "../../lib/instagramApi";
import { supabase } from "../../lib/supabaseClient";
import AnalyticsBarChart from "./overview/AnalyticsBarChart";
import AnalyticsDoughnutChart from "./overview/AnalyticsDoughnutChart";
import ChartPanel from "./overview/ChartPanel";
import InstagramTrendChart from "./overview/InstagramTrendChart";
import MetricCard from "./overview/MetricCard";
import { chartPalette } from "./overview/chartSetup";
import AdminTikTok from "./AdminTikTok";
import "./AdminDashboard.css";

const PRIMARY_METRICS = Object.freeze([
  ["views", "Views", "blue"],
  ["reach", "Reach", "teal"],
  ["accounts_engaged", "Accounts Engaged", "amber"],
  ["total_interactions", "Total Interactions", "slate"],
]);
const SECONDARY_METRICS = Object.freeze([
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["shares", "Shares"],
  ["saves", "Saves"],
  ["replies", "Replies"],
  ["profile_links_taps", "Profile Link Taps"],
]);
const INTERACTION_METRICS = Object.freeze([
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["shares", "Shares"],
  ["saves", "Saves"],
  ["replies", "Replies"],
]);
const INTERACTION_COLORS = ["#1d4ed8", "#0f766e", "#d97706", "#6d5bd0", "#0e7490"];

function availableMetric(data, name) {
  const metric = data?.insights?.metrics?.[name];
  return metric?.available && typeof metric.value === "number" ? metric.value : null;
}

function compactNumber(value) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return date.toLocaleString(undefined, withTime
    ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" });
}

function safeInstagramLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "instagram.com" || url.hostname.endsWith(".instagram.com")) ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function performanceValue(media, metric) {
  const value = media?.performance?.[metric];
  return typeof value === "number" ? value : null;
}

function MediaVisual({ item }) {
  const image = safeImage(item.thumbnailUrl || item.mediaUrl);
  return image
    ? <img src={image} alt="" loading="lazy" decoding="async" />
    : <div className="admin-instagram-media-placeholder" aria-hidden="true"><span>IG</span></div>;
}

function MediaCard({ item, rank = null, rankingMetric = null }) {
  const permalink = safeInstagramLink(item.permalink);
  const rankedValue = rankingMetric ? performanceValue(item, rankingMetric) : null;
  const content = (
    <>
      <div className="admin-instagram-media-visual"><MediaVisual item={item} />{rank && <span className="admin-instagram-media-rank">#{rank}</span>}<small>{String(item.mediaType || "Media").replaceAll("_", " ")}</small></div>
      <div className="admin-instagram-media-copy">
        <p>{item.caption || "No caption provided."}</p>
        <span>{formatDate(item.timestamp)}</span>
        <div className="admin-instagram-media-metrics">
          {rankedValue !== null && <b>{compactNumber(rankedValue)} {rankingMetric}</b>}
          {performanceValue(item, "reach") !== null && rankingMetric !== "reach" && <b>{compactNumber(performanceValue(item, "reach"))} reach</b>}
          {performanceValue(item, "interactions") !== null && rankingMetric !== "interactions" && <b>{compactNumber(performanceValue(item, "interactions"))} interactions</b>}
        </div>
      </div>
    </>
  );
  return permalink
    ? <a className="admin-instagram-media-card" href={permalink} target="_blank" rel="noreferrer" aria-label={`Open Instagram content from ${formatDate(item.timestamp)}`}>{content}</a>
    : <article className="admin-instagram-media-card">{content}</article>;
}

function SectionHeading({ eyebrow, title, detail }) {
  return <div className="admin-instagram-section-heading"><div><p className="admin-eyebrow">{eyebrow}</p><h2>{title}</h2></div>{detail && <span>{detail}</span>}</div>;
}

function InstagramDashboard() {
  const [range, setRange] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [rankingMetric, setRankingMetric] = useState("interactions");
  const requestId = useRef(0);

  const load = useCallback(async (force = false) => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    if (force) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const nextData = await loadInstagramDashboard(supabase, range, { refresh: force });
      if (requestId.current === currentRequest) setData(nextData);
    } catch (loadError) {
      if (requestId.current === currentRequest) setError(loadError.message || "Instagram analytics could not be loaded.");
    } finally {
      if (requestId.current === currentRequest) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [range]);

  useEffect(() => { load(false); }, [load]);

  const rangeLabel = INSTAGRAM_RANGE_OPTIONS.find((option) => option.value === range)?.label || `Last ${range} days`;
  const primaryMetrics = useMemo(() => [
    ...(typeof data?.profile?.followers === "number" ? [{ key: "followers", label: "Followers", value: data.profile.followers, tone: "blue", note: "Current account total" }] : []),
    ...PRIMARY_METRICS.flatMap(([key, label, tone]) => {
      const value = availableMetric(data, key);
      return value === null ? [] : [{ key, label, value, tone, note: rangeLabel }];
    }),
  ], [data, rangeLabel]);
  const secondaryMetrics = useMemo(() => SECONDARY_METRICS.flatMap(([key, label]) => {
    const value = availableMetric(data, key);
    return value === null ? [] : [{ key, label, value }];
  }), [data]);
  const interactions = useMemo(() => INTERACTION_METRICS.flatMap(([key, label]) => {
    const value = availableMetric(data, key);
    return value === null ? [] : [{ key, label, value }];
  }), [data]);
  const trendAvailable = Object.values(data?.insights?.trends || {}).some((series) => Array.isArray(series) && series.length);
  const audience = data?.insights?.audience || {};
  const audienceAvailable = Object.values(audience).some((items) => Array.isArray(items) && items.length);
  const rankedMedia = data?.topContent?.[rankingMetric] || [];

  return (
    <div className="admin-tab-content admin-instagram-view" aria-busy={loading || refreshing}>
      <div className="admin-view-header admin-instagram-page-header">
        <div><p className="admin-eyebrow">Connected channels</p><h1 className="admin-page-title">Instagram</h1><p className="admin-page-desc">Instagram account performance, audience insights and recent content from the official API.</p></div>
        <div className="admin-header-actions">
          <label className="admin-instagram-range"><span>Analytics range</span><select value={range} onChange={(event) => setRange(Number(event.target.value))} disabled={loading || refreshing}>{INSTAGRAM_RANGE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
          <button className="btn-secondary" type="button" onClick={() => load(true)} disabled={loading || refreshing}>{refreshing ? "Refreshing…" : "Refresh Instagram Data"}</button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert"><span>{error}</span><button className="btn-secondary" type="button" onClick={() => load(false)}>Retry</button></div>}
      {data?.meta?.refreshThrottled && <div className="admin-instagram-notice" role="status">The latest cached data is shown. Manual refresh is limited to once per minute.</div>}

      {loading && !data && <div className="admin-instagram-loading-grid" aria-label="Loading Instagram analytics">{[1, 2, 3, 4, 5].map((item) => <div className="skeleton-shimmer" key={item} />)}</div>}

      {data && <>
        <section className="admin-instagram-profile-card">
          <div className="admin-instagram-profile-main">
            <div className="admin-instagram-avatar">{safeImage(data.profile?.profilePictureUrl) ? <img src={safeImage(data.profile.profilePictureUrl)} alt={`${data.profile.username || "Instagram"} profile`} /> : <span>IG</span>}</div>
            <div><span className="admin-instagram-connected"><i />Connected</span><h2>@{data.profile?.username || "Instagram account"}</h2><p>{data.profile?.name || data.profile?.accountType || "Professional Instagram account"}</p></div>
          </div>
          <div className="admin-instagram-profile-meta">
            {typeof data.profile?.mediaCount === "number" && <span><small>MEDIA</small><strong>{data.profile.mediaCount.toLocaleString()}</strong></span>}
            <span><small>LAST SUCCESSFUL SYNC</small><strong>{formatDate(data.meta?.syncedAt, true)}</strong></span>
            <span><small>CONNECTION</small><strong>{data.connection?.provider || "Instagram API"}</strong></span>
          </div>
        </section>

        {primaryMetrics.length > 0 && <div className="admin-metric-widget-grid admin-instagram-kpis">{primaryMetrics.map((metric) => <MetricCard key={metric.key} label={metric.label} value={metric.value} note={metric.note} tone={metric.tone} />)}</div>}

        <div className="admin-chart-widget-grid admin-analytics-grid admin-instagram-analytics-grid">
          <ChartPanel className="is-wide" title="Reach / views trend" description={`Time-series values returned by Instagram · ${rangeLabel}`} summary={trendAvailable ? "Daily API series" : "No time series available"}>
            {trendAvailable ? <InstagramTrendChart trends={data.insights.trends} /> : <div className="admin-chart-empty">Instagram returned aggregate values only for this reporting range.</div>}
          </ChartPanel>

          <ChartPanel title="Interaction breakdown" description={`Available account interactions · ${rangeLabel}`} summary={interactions.length ? `${interactions.length} available metrics` : "Unavailable"}>
            {interactions.length ? <AnalyticsDoughnutChart labels={interactions.map((item) => item.label)} values={interactions.map((item) => item.value)} colors={INTERACTION_COLORS} centerValue={availableMetric(data, "total_interactions") ?? interactions.reduce((sum, item) => sum + item.value, 0)} centerLabel="Interactions" datasetLabel="Interactions" ariaLabel={`Instagram interaction breakdown for ${rangeLabel}`} /> : <div className="admin-chart-empty">Instagram did not return interaction metrics for this range.</div>}
          </ChartPanel>

          <section className="admin-chart-widget admin-instagram-rate-card">
            <header><div><h2>Engagement quality</h2><p>Only calculated from compatible period metrics</p></div></header>
            {typeof data.insights?.engagementRate === "number" ? <div className="admin-instagram-rate"><strong>{data.insights.engagementRate.toLocaleString()}%</strong><span>Engagement rate</span><p>{data.insights.engagementRateFormula}</p></div> : <div className="admin-chart-empty">Reach and total interactions were not both available for the same range.</div>}
            {data.insights?.followerChange && <div className="admin-instagram-follower-change">
              <span><small>FOLLOWS</small><strong>{data.insights.followerChange.follows ?? "—"}</strong></span>
              <span><small>UNFOLLOWS</small><strong>{data.insights.followerChange.unfollows ?? "—"}</strong></span>
              <span><small>NET CHANGE</small><strong className={data.insights.followerChange.net >= 0 ? "is-positive" : "is-negative"}>{data.insights.followerChange.net ?? "—"}</strong></span>
            </div>}
          </section>
        </div>

        {secondaryMetrics.length > 0 && <><SectionHeading eyebrow="Account details" title="Secondary performance" detail={rangeLabel} /><div className="admin-instagram-secondary-grid">{secondaryMetrics.map((metric) => <div key={metric.key}><small>{metric.label}</small><strong>{metric.value.toLocaleString()}</strong></div>)}</div></>}

        {audienceAvailable && <>
          <SectionHeading eyebrow="Audience" title="Audience analytics" detail="Shown only where Instagram returned demographic data" />
          <div className="admin-chart-widget-grid admin-analytics-grid admin-instagram-audience-grid">
            {audience.gender?.length > 0 && <ChartPanel title="Gender" description="Follower demographic distribution" summary={`${audience.gender.length} groups`}><AnalyticsDoughnutChart labels={audience.gender.map((item) => item.label)} values={audience.gender.map((item) => item.value)} centerValue={audience.gender.reduce((sum, item) => sum + item.value, 0)} centerLabel="Followers" datasetLabel="Followers" ariaLabel="Instagram follower gender demographics" /></ChartPanel>}
            {audience.age?.length > 0 && <ChartPanel title="Age" description="Follower age groups returned by Instagram" summary={`${audience.age.length} groups`}><AnalyticsBarChart labels={audience.age.map((item) => item.label)} values={audience.age.map((item) => item.value)} datasetLabel="Followers" color={chartPalette.blue} ariaLabel="Instagram follower age demographics" /></ChartPanel>}
            {audience.city?.length > 0 && <ChartPanel title="Top cities" description="Follower location distribution" summary={`${audience.city.length} cities`} height={Math.max(285, audience.city.length * 32)}><AnalyticsBarChart horizontal labels={audience.city.map((item) => item.label)} values={audience.city.map((item) => item.value)} datasetLabel="Followers" color={chartPalette.teal} ariaLabel="Instagram follower city demographics" /></ChartPanel>}
            {audience.country?.length > 0 && <ChartPanel title="Top countries" description="Follower country distribution" summary={`${audience.country.length} countries`} height={Math.max(285, audience.country.length * 32)}><AnalyticsBarChart horizontal labels={audience.country.map((item) => item.label)} values={audience.country.map((item) => item.value)} datasetLabel="Followers" color={chartPalette.amber} ariaLabel="Instagram follower country demographics" /></ChartPanel>}
          </div>
        </>}

        <SectionHeading eyebrow="Content" title="Recent Instagram media" detail={`${data.media?.length || 0} items fetched`} />
        {data.media?.length ? <div className="admin-instagram-media-grid">{data.media.map((item) => <MediaCard item={item} key={item.id} />)}</div> : <div className="admin-empty-state">Instagram returned no recent media for this account.</div>}

        <SectionHeading eyebrow="Performance" title="Top performing content" detail="Ranked from available media insights" />
        <div className="admin-instagram-ranking-tabs" role="group" aria-label="Rank content by"><button type="button" className={rankingMetric === "interactions" ? "is-active" : ""} onClick={() => setRankingMetric("interactions")}>Interactions</button><button type="button" className={rankingMetric === "reach" ? "is-active" : ""} onClick={() => setRankingMetric("reach")}>Reach</button><button type="button" className={rankingMetric === "views" ? "is-active" : ""} onClick={() => setRankingMetric("views")}>Views</button></div>
        {rankedMedia.length ? <div className="admin-instagram-top-grid">{rankedMedia.slice(0, 3).map((item, index) => <MediaCard item={item} key={item.id} rank={index + 1} rankingMetric={rankingMetric} />)}</div> : <div className="admin-empty-state">No recent media returned the selected performance metric.</div>}

        <SectionHeading eyebrow="System activity" title="Instagram Activity" detail="Analytics sync events—not an Instagram notification inbox" />
        <section className="admin-panel admin-instagram-activity-list">
          {(data.activity || []).map((item) => <div key={item.id} className={`is-${item.tone || "neutral"}`}><i /><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{formatDate(item.timestamp, true)}</time></div>)}
          {!data.activity?.length && <div className="admin-empty-state">No Instagram analytics activity is available.</div>}
        </section>
      </>}
    </div>
  );
}

export default function AdminSocialMedia() {
  const [platform, setPlatform] = useState(() => {
    if (typeof window === "undefined") return "instagram";
    return new URLSearchParams(window.location.search).get("platform") === "tiktok" ? "tiktok" : "instagram";
  });

  const choosePlatform = (nextPlatform) => {
    setPlatform(nextPlatform);
    const url = new URL(window.location.href);
    url.searchParams.set("platform", nextPlatform);
    url.searchParams.set("adminTab", "social_media");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return <div className="admin-social-media-shell">
    <nav className="admin-social-platform-tabs" aria-label="Social media platform">
      <button type="button" className={platform === "instagram" ? "is-active" : ""} onClick={() => choosePlatform("instagram")} aria-current={platform === "instagram" ? "page" : undefined}>
        <span className="is-instagram" aria-hidden="true">◎</span><div><strong>Instagram</strong><small>Account insights & media</small></div>
      </button>
      <button type="button" className={platform === "tiktok" ? "is-active" : ""} onClick={() => choosePlatform("tiktok")} aria-current={platform === "tiktok" ? "page" : undefined}>
        <span className="is-tiktok" aria-hidden="true">♪</span><div><strong>TikTok</strong><small>Profile & public videos</small></div>
      </button>
    </nav>
    {platform === "instagram" ? <InstagramDashboard /> : <AdminTikTok />}
  </div>;
}
