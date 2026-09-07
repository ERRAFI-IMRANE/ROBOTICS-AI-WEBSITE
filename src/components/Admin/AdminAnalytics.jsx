import React, { useCallback, useEffect, useState } from "react";
import { supabase, publicContent } from "../../lib/supabaseClient";
import { loadAdminOverview } from "../../lib/adminOverview";
import { eventView } from "../../lib/adminEvents";

// Predefined activity telemetry points (Monthly engagement index)
const ACTIVITY_POINTS = [
  { month: "Oct", val: 32, label: "32 hrs active lab time" },
  { month: "Nov", val: 58, label: "58 hrs · Hackathon cycle" },
  { month: "Dec", val: 45, label: "45 hrs · Midterm builds" },
  { month: "Jan", val: 76, label: "76 hrs · ROS2 workshop" },
  { month: "Feb", val: 92, label: "92 hrs · Competition prep" },
  { month: "Mar", val: 110, label: "110 hrs · Rover v4 integration" },
];

export default function AdminAnalytics({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadAdminOverview(supabase, publicContent);
      setSummary(result);
      setError(result.errors.join(" "));
    } catch (err) {
      setError(err.message || "Could not load the overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = [
    { label: "Staff profiles", count: summary?.staff, target: "team", sub: "Committee & leads" },
    { label: "Club members", count: summary?.members, target: "members", sub: "Admitted members" },
    { label: "Pending applications", count: summary?.pending, target: "members", sub: "Awaiting review" },
    { label: "Club events", count: summary?.events?.length, target: "events", sub: "Active season track" },
  ];

  // SVG Chart Geometry Calculations (Width: 600, Height: 150)
  const maxVal = 120;
  const chartWidth = 600;
  const chartHeight = 150;
  const points = ACTIVITY_POINTS.map((pt, i) => {
    const x = (i / (ACTIVITY_POINTS.length - 1)) * (chartWidth - 60) + 30;
    const y = chartHeight - (pt.val / maxVal) * (chartHeight - 30) - 15;
    return { ...pt, x, y };
  });

  // Create smooth bezier curve path
  const curvePath = points.reduce((acc, pt, i, arr) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    const prev = arr[i - 1];
    const cx = (prev.x + pt.x) / 2;
    return `${acc} C ${cx},${prev.y} ${cx},${pt.y} ${pt.x},${pt.y}`;
  }, "");

  const areaPath = `${curvePath} L ${points[points.length - 1].x},${chartHeight} L ${points[0].x},${chartHeight} Z`;

  return (
    <div className="admin-tab-content">
      {/* View Header */}
      <div className="admin-view-header">
        <div>
          <p className="admin-eyebrow">Robotics & AI / EST Safi</p>
          <h1 className="admin-page-title">Command Overview</h1>
          <p className="admin-page-desc">Real-time club health, membership telemetry, and event velocity.</p>
        </div>
        <div className="admin-header-actions">
          <button className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh telemetry"}
          </button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert">{error}</div>}

      {summary?.settingsWarning && (
        <div className="admin-demo-notice" role="status">
          <span>Season settings are unavailable. Staff and events are loaded independently.</span>
          <button className="btn-secondary" onClick={() => onNavigate("settings")}>
            View setup details ↗
          </button>
        </div>
      )}

      {/* Hero Card */}
      <div className="admin-overview-hero">
        <div>
          <p className="admin-eyebrow">EST SAFI ACADEMIC SEASON</p>
          <h2>Precision engineering.<br />Collaborative intelligence.</h2>
          <p>
            {summary?.settings
              ? `Current active season · ${summary.settings.current_season}`
              : "Robotics & AI Club Officer Workspace"}
          </p>
          <button className="btn-primary" onClick={() => onNavigate("settings")}>
            Configure parameters ↗
          </button>
        </div>
        <img src="/RAI/club sign.png" alt="Club sign" />
      </div>

      {/* Key Performance Metrics Grid */}
      <div className="admin-metric-grid">
        {metrics.map(({ label, count, target, sub }) => (
          <button
            className="admin-metric-card"
            key={label}
            onClick={() => onNavigate(target)}
            type="button"
            title={`Go to ${label}`}
          >
            <span>{label}</span>
            {loading ? (
              <div className="skeleton-shimmer skeleton-line" style={{ height: "36px", width: "45%" }} />
            ) : (
              <strong>{count ?? "0"}</strong>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 400 }}>{sub}</span>
              <span>Manage ↗</span>
            </div>
          </button>
        ))}
      </div>

      {/* Activity Velocity SVG Chart Panel */}
      <section className="admin-panel admin-chart-panel">
        <div className="admin-panel-header">
          <div>
            <h2 className="admin-panel-heading">Hardware lab activity & workshop velocity</h2>
            <p className="admin-panel-meta">Aggregated logged bench hours and technical sessions</p>
          </div>
          <span className="status-chip status-chip-positive">
            <span className="status-chip-dot" />
            <span>Telemetry active</span>
          </span>
        </div>

        <div className="admin-chart-svg-wrap">
          <svg
            className="admin-chart-svg"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="activityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            <line x1="0" y1="35" x2={chartWidth} y2="35" className="chart-grid-line" />
            <line x1="0" y1="80" x2={chartWidth} y2="80" className="chart-grid-line" />
            <line x1="0" y1="125" x2={chartWidth} y2="125" className="chart-grid-line" />

            {/* Gradient Fill Area */}
            <path d={areaPath} className="chart-path-area" />

            {/* Bezier Line */}
            <path d={curvePath} className="chart-path-line" />

            {/* Interactive Data Points */}
            {points.map((pt, idx) => (
              <g key={pt.month}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="4"
                  className="chart-point"
                  onMouseEnter={() => setHoveredPoint(pt)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                <text
                  x={pt.x}
                  y={chartHeight - 4}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                >
                  {pt.month}
                </text>
              </g>
            ))}
          </svg>

          {/* Hover Tooltip Badge */}
          {hoveredPoint && (
            <div
              className="chart-tooltip-badge"
              style={{
                left: `${(hoveredPoint.x / chartWidth) * 100}%`,
                top: `${(hoveredPoint.y / chartHeight) * 100}%`,
              }}
            >
              {hoveredPoint.label}
            </div>
          )}
        </div>
      </section>

      {/* Latest Events Section */}
      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h2 className="admin-panel-heading">Recent event records</h2>
            <p className="admin-panel-meta">Loaded from Supabase live database</p>
          </div>
          <button className="btn-secondary" onClick={() => onNavigate("events")}>
            All events ↗
          </button>
        </div>

        <div className="table-container">
          <table className="hairline-table">
            <thead>
              <tr>
                <th>Experience title</th>
                <th>Scheduled date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <>
                  <tr className="skeleton-row">
                    <td><div className="skeleton-shimmer skeleton-line" style={{ width: "60%" }} /></td>
                    <td><div className="skeleton-shimmer skeleton-line" style={{ width: "40%" }} /></td>
                    <td><div className="skeleton-shimmer skeleton-line" style={{ width: "30%" }} /></td>
                  </tr>
                  <tr className="skeleton-row">
                    <td><div className="skeleton-shimmer skeleton-line" style={{ width: "75%" }} /></td>
                    <td><div className="skeleton-shimmer skeleton-line" style={{ width: "45%" }} /></td>
                    <td><div className="skeleton-shimmer skeleton-line" style={{ width: "35%" }} /></td>
                  </tr>
                  <tr className="skeleton-row">
                    <td><div className="skeleton-shimmer skeleton-line" style={{ width: "50%" }} /></td>
                    <td><div className="skeleton-shimmer skeleton-line" style={{ width: "40%" }} /></td>
                    <td><div className="skeleton-shimmer skeleton-line" style={{ width: "30%" }} /></td>
                  </tr>
                </>
              )}

              {!loading && summary?.events === null && (
                <tr>
                  <td colSpan={3} className="admin-empty-state">
                    Events could not be loaded. Use &ldquo;Refresh telemetry&rdquo; to retry.
                  </td>
                </tr>
              )}

              {!loading && summary?.events?.length === 0 && (
                <tr>
                  <td colSpan={3} className="admin-empty-state">
                    No club events registered yet.
                  </td>
                </tr>
              )}

              {!loading &&
                summary?.events?.slice(0, 5).map((row) => {
                  const event = eventView(row);
                  const isCompleted = event.status === "Completed";
                  return (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600 }}>{event.title}</td>
                      <td style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                        {event.date || "Date not set"}
                      </td>
                      <td>
                        <span className={`status-chip status-chip-${isCompleted ? "positive" : "warning"}`}>
                          <span className="status-chip-dot" />
                          <span>{event.status}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
