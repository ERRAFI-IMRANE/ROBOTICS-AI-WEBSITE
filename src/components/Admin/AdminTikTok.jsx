import React, { useCallback, useEffect, useMemo, useState } from "react";
import { disconnectTikTok, loadTikTokDashboard, startTikTokConnection } from "../../lib/tiktokApi";
import { supabase } from "../../lib/supabaseClient";
import { AdminConfirmDialog, AdminToast } from "./AdminActionFeedback";
import ChartPanel from "./overview/ChartPanel";
import MetricCard from "./overview/MetricCard";
import { TikTokEngagementChart, TikTokPerformanceChart, TikTokViewsChart } from "./overview/TikTokVideoCharts";

const PROFILE_KPIS = Object.freeze([
  ["followers", "Followers", "blue"],
  ["following", "Following", "teal"],
  ["totalLikes", "Profile Total Likes", "amber"],
  ["videoCount", "Profile Videos", "slate"],
]);
const VIDEO_TOTALS = Object.freeze([
  ["views", "Fetched Video Views"],
  ["likes", "Fetched Video Likes"],
  ["comments", "Fetched Video Comments"],
  ["shares", "Fetched Video Shares"],
]);
const RANKING_OPTIONS = Object.freeze([
  ["views", "Views"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["shares", "Shares"],
  ["engagement", "Engagement"],
]);

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

function safeTikTokLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "tiktok.com" || url.hostname.endsWith(".tiktok.com")) ? url.toString() : "";
  } catch { return ""; }
}

function safeImage(value) {
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : ""; } catch { return ""; }
}

function connectionLabel(state) {
  return ({ connected: "Connected", not_connected: "Not Connected", connection_error: "Connection Error", token_expired: "Token Expired" })[state] || "Connection Error";
}

function SectionHeading({ eyebrow, title, detail }) {
  return <div className="admin-instagram-section-heading"><div><p className="admin-eyebrow">{eyebrow}</p><h2>{title}</h2></div>{detail && <span>{detail}</span>}</div>;
}

function TikTokVideoCard({ video, rank = null, metric = null }) {
  const href = safeTikTokLink(video.shareUrl);
  const cover = safeImage(video.coverUrl);
  const content = <>
    <div className="admin-instagram-media-visual">
      {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <div className="admin-instagram-media-placeholder"><span>TT</span></div>}
      {rank && <span className="admin-instagram-media-rank">#{rank}</span>}
      <small>{video.duration !== null ? `${video.duration}s video` : "Video"}</small>
    </div>
    <div className="admin-instagram-media-copy">
      <p>{video.title || video.description || "Untitled TikTok video"}</p>
      <span>{formatDate(video.createdAt)}</span>
      <div className="admin-instagram-media-metrics">
        {metric && typeof video[metric] === "number" && <b>{compactNumber(video[metric])} {metric}</b>}
        {typeof video.views === "number" && metric !== "views" && <b>{compactNumber(video.views)} views</b>}
        {typeof video.likes === "number" && metric !== "likes" && <b>{compactNumber(video.likes)} likes</b>}
        {typeof video.engagementRate === "number" && <b>{video.engagementRate}% rate</b>}
      </div>
    </div>
  </>;
  return href
    ? <a className="admin-instagram-media-card" href={href} target="_blank" rel="noreferrer" aria-label={`Open TikTok video from ${formatDate(video.createdAt)}`}>{content}</a>
    : <article className="admin-instagram-media-card">{content}</article>;
}

export default function AdminTikTok() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rankingMetric, setRankingMetric] = useState("views");
  const [confirmation, setConfirmation] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async (refresh = false) => {
    setError("");
    if (refresh) setBusy("refresh");
    else setLoading(true);
    try {
      const next = await loadTikTokDashboard(supabase, { refresh });
      setData(next);
    } catch (loadError) {
      setError(loadError.message || "TikTok could not be loaded.");
    } finally {
      setLoading(false);
      setBusy("");
    }
  }, []);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("tiktok");
    if (!outcome) return;
    if (outcome === "connected") setToast({ type: "success", message: "TikTok was connected successfully." });
    else if (outcome === "cancelled") setToast({ type: "error", message: "TikTok authorization was cancelled." });
    else setToast({ type: "error", message: url.searchParams.get("reason") === "invalid_state" ? "TikTok authorization could not be verified. Please reconnect." : "TikTok could not be connected." });
    url.searchParams.delete("tiktok");
    url.searchParams.delete("reason");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const connect = async () => {
    setBusy("connect");
    setError("");
    try { await startTikTokConnection(supabase); }
    catch (connectError) { setError(connectError.message || "TikTok authorization could not start."); setBusy(""); }
  };

  const confirmDisconnect = async () => {
    setBusy("disconnect");
    try {
      const result = await disconnectTikTok(supabase);
      setConfirmation(null);
      setData((current) => ({ ...(current || {}), connection: result, profile: null, videos: [], totals: {}, topVideos: {}, activity: [] }));
      setToast({ type: "success", message: result.warning || "TikTok was disconnected." });
    } catch (disconnectError) {
      setToast({ type: "error", message: disconnectError.message || "TikTok could not be disconnected." });
    } finally { setBusy(""); }
  };

  const connection = data?.connection || null;
  const connected = connection?.connected === true;
  const profileKpis = useMemo(() => PROFILE_KPIS.flatMap(([key, label, tone]) => typeof data?.profile?.[key] === "number" ? [{ key, label, tone, value: data.profile[key] }] : []), [data]);
  const videoTotals = useMemo(() => VIDEO_TOTALS.flatMap(([key, label]) => typeof data?.totals?.[key] === "number" ? [{ key, label, value: data.totals[key] }] : []), [data]);
  const chartVideos = useMemo(() => (data?.videos || []).filter((video) => typeof video.views === "number" || typeof video.engagement === "number").slice(0, 12), [data]);
  const rankedVideos = data?.topVideos?.[rankingMetric] || [];

  return <div className="admin-tab-content admin-instagram-view admin-tiktok-view" aria-busy={loading || Boolean(busy)}>
    <div className="admin-view-header admin-instagram-page-header">
      <div><p className="admin-eyebrow">Connected channels</p><h1 className="admin-page-title">TikTok</h1><p className="admin-page-desc">Profile statistics and current public-video performance from TikTok Display API.</p></div>
      <div className="admin-header-actions">
        {connected && <button className="btn-secondary" type="button" onClick={() => load(true)} disabled={Boolean(busy)}>{busy === "refresh" ? "Refreshing…" : "Refresh Data"}</button>}
        {connection && connection.state !== "not_connected" && <button className="btn-secondary" type="button" onClick={connect} disabled={Boolean(busy)}>{busy === "connect" ? "Redirecting…" : "Reconnect"}</button>}
        {connected && <button className="btn-secondary btn-danger" type="button" onClick={() => setConfirmation({ title: "Disconnect TikTok?", message: "The stored TikTok authorization will be removed and the app will request remote revocation.", confirmLabel: "Disconnect", tone: "danger" })} disabled={Boolean(busy)}>Disconnect</button>}
      </div>
    </div>

    {error && <div className="admin-inline-error" role="alert"><span>{error}</span><button className="btn-secondary" type="button" onClick={() => load(false)}>Retry</button></div>}
    {data?.meta?.refreshThrottled && <div className="admin-instagram-notice">The latest cached TikTok data is shown. Manual refresh is limited to once per minute.</div>}
    {connection?.missingScopes?.length > 0 && <div className="admin-instagram-notice" role="status">Reconnect TikTok and approve: {connection.missingScopes.join(", ")}.</div>}
    {data?.errors?.map((item, index) => <div className="admin-instagram-notice" role="status" key={`${item.code}-${index}`}>{item.message}</div>)}

    {loading && !data && <div className="admin-instagram-loading-grid" aria-label="Loading TikTok data">{[1, 2, 3, 4].map((item) => <div className="skeleton-shimmer" key={item} />)}</div>}

    {!loading && connection?.state === "not_connected" && <section className="admin-tiktok-connect-card">
      <span className="admin-tiktok-mark" aria-hidden="true">♪</span>
      <p className="admin-eyebrow">TikTok Display API</p>
      <h2>Connect the club’s TikTok account</h2>
      <p>Authorize profile statistics and public videos. Access and refresh tokens stay on the server.</p>
      <button className="btn-primary" type="button" onClick={connect} disabled={Boolean(busy)}>{busy === "connect" ? "Opening TikTok…" : "Connect TikTok"}</button>
      <small>For local development, open this site through the registered HTTPS tunnel—not localhost.</small>
    </section>}

    {!loading && connection?.state === "token_expired" && <section className="admin-tiktok-connect-card is-error">
      <span className="admin-tiktok-mark" aria-hidden="true">!</span><p className="admin-eyebrow">Token expired</p><h2>Reconnect TikTok</h2><p>The saved authorization can no longer be refreshed.</p><button className="btn-primary" type="button" onClick={connect} disabled={Boolean(busy)}>Reconnect</button>
    </section>}

    {connected && <>
      <section className="admin-instagram-profile-card admin-tiktok-profile-card">
        <div className="admin-instagram-profile-main">
          <div className="admin-instagram-avatar">{safeImage(data.profile?.avatarUrl) ? <img src={safeImage(data.profile.avatarUrl)} alt={`${data.profile.displayName || "TikTok"} profile`} /> : <span>TT</span>}</div>
          <div><span className={`admin-instagram-connected is-${connection.state}`}><i />{connectionLabel(connection.state)}</span><h2>{data.profile?.displayName || "TikTok account"}{data.profile?.verified ? " ✓" : ""}</h2><p>{data.profile?.username ? `@${data.profile.username}` : data.profile?.bio || "Connected TikTok profile"}</p></div>
        </div>
        <div className="admin-instagram-profile-meta">
          <span><small>PUBLIC VIDEOS FETCHED</small><strong>{data.videos?.length || 0}</strong></span>
          <span><small>LAST SUCCESSFUL SYNC</small><strong>{formatDate(data.meta?.syncedAt, true)}</strong></span>
          <span><small>PROFILE</small><strong>{safeTikTokLink(data.profile?.profileUrl) ? <a href={safeTikTokLink(data.profile.profileUrl)} target="_blank" rel="noreferrer">Open on TikTok ↗</a> : "Connected account"}</strong></span>
        </div>
      </section>

      {profileKpis.length > 0 && <div className="admin-metric-widget-grid admin-instagram-kpis">{profileKpis.map((metric) => <MetricCard key={metric.key} label={metric.label} value={metric.value} tone={metric.tone} note="TikTok profile statistic" />)}</div>}

      {videoTotals.length > 0 && <><SectionHeading eyebrow="Fetched public videos" title="Video-level totals" detail="Not account-wide totals" /><div className="admin-instagram-secondary-grid">{videoTotals.map((metric) => <div key={metric.key}><small>{metric.label}</small><strong>{metric.value.toLocaleString()}</strong></div>)}</div></>}

      {chartVideos.length > 0 && <div className="admin-chart-widget-grid admin-analytics-grid admin-tiktok-chart-grid">
        <ChartPanel title="Views by video" description="Current view count for recently fetched public videos" summary={`${chartVideos.length} videos`}><TikTokViewsChart videos={chartVideos} /></ChartPanel>
        <ChartPanel title="Engagement by video" description="Current likes, comments and shares—stacked by video" summary="Public counters"><TikTokEngagementChart videos={chartVideos} /></ChartPanel>
        <ChartPanel className="is-wide" title="Published-video performance" description="Current totals positioned by each video’s publication date—not daily account reach" summary="Views and engagement"><TikTokPerformanceChart videos={chartVideos} /></ChartPanel>
      </div>}

      <SectionHeading eyebrow="Content" title="Recent TikTok videos" detail={`${data.videos?.length || 0} videos fetched`} />
      {data.videos?.length ? <div className="admin-instagram-media-grid">{data.videos.map((video) => <TikTokVideoCard video={video} key={video.id} />)}</div> : <div className="admin-empty-state">TikTok returned no public videos for this account.</div>}

      <SectionHeading eyebrow="Performance" title="Top performing videos" detail="Current public-video counters" />
      <div className="admin-instagram-ranking-tabs admin-tiktok-ranking-tabs" role="group" aria-label="Rank TikTok videos by">{RANKING_OPTIONS.map(([value, label]) => <button type="button" key={value} className={rankingMetric === value ? "is-active" : ""} onClick={() => setRankingMetric(value)}>{label}</button>)}</div>
      {rankedVideos.length ? <div className="admin-instagram-top-grid">{rankedVideos.slice(0, 3).map((video, index) => <TikTokVideoCard video={video} key={video.id} rank={index + 1} metric={rankingMetric} />)}</div> : <div className="admin-empty-state">No fetched video returned the selected metric.</div>}
      <p className="admin-tiktok-formula">Video engagement rate = (likes + comments + shares) / views × 100, calculated only when all interaction counters exist and views are greater than zero.</p>

      <SectionHeading eyebrow="System activity" title="TikTok Activity" detail="API sync activity—not TikTok notifications" />
      <section className="admin-panel admin-instagram-activity-list">{(data.activity || []).map((item) => <div key={item.id} className={`is-${item.tone || "neutral"}`}><i /><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{formatDate(item.timestamp, true)}</time></div>)}</section>
    </>}

    <AdminConfirmDialog confirmation={confirmation} busy={busy === "disconnect"} onCancel={() => setConfirmation(null)} onConfirm={confirmDisconnect} />
    <AdminToast toast={toast} onClose={() => setToast(null)} />
  </div>;
}
