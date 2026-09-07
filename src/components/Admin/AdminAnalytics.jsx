import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getYearOfStudyLabel } from "../../constants/registrationConstants";
import { eventView } from "../../lib/adminEvents";
import { loadAdminWorkspace } from "../../lib/adminWorkspace";
import { publicContent, supabase } from "../../lib/supabaseClient";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHART_COLORS = ["#1468f2", "#35b9da", "#6d5dfc", "#20ad85", "#ff9f43", "#e35d76"];
const MONTH_LOOKUP = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function clean(value, fallback = "Not specified") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function groupRows(rows, getKey, order = null) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = clean(getKey(row));
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const data = [...counts].map(([label, value]) => ({ label, value }));
  if (order) return order.map((label) => data.find((entry) => entry.label === label) || { label, value: 0 });
  return data.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function parseEventDate(row) {
  const raw = clean(eventView(row).date || row.created_at, "");
  const parsed = raw ? new Date(raw) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return { year: parsed.getFullYear(), month: parsed.getMonth() };
  const yearMatch = raw.match(/\b(20\d{2})\b/);
  const monthMatch = raw.toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b/);
  return { year: yearMatch ? Number(yearMatch[1]) : null, month: monthMatch ? MONTH_LOOKUP[monthMatch[1]] : null };
}

function VizCard({ className = "", eyebrow, title, subtitle, leader, children }) {
  return (
    <section className={`admin-viz-card ${className}`}>
      <header className="admin-viz-header">
        <div><span>{eyebrow}</span><h2>{title}</h2><p>{subtitle}</p></div>
        {leader && <strong>{leader}</strong>}
      </header>
      {children}
    </section>
  );
}

function AreaTrend({ data, suffix }) {
  const peakIndex = Math.max(0, data.reduce((best, item, index) => item.value > (data[best]?.value ?? -1) ? index : best, 0));
  const [activeIndex, setActiveIndex] = useState(peakIndex);
  const width = 720;
  const height = 236;
  const left = 32;
  const right = 18;
  const top = 26;
  const bottom = 34;
  const max = Math.max(...data.map((item) => item.value), 1);
  const points = data.map((item, index) => ({
    ...item,
    x: left + (index * (width - left - right)) / Math.max(data.length - 1, 1),
    y: top + (1 - item.value / max) * (height - top - bottom),
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = points.length ? `${line} L${points.at(-1).x},${height - bottom} L${points[0].x},${height - bottom} Z` : "";
  const active = points[activeIndex] || points[0];

  useEffect(() => { setActiveIndex(peakIndex); }, [peakIndex]);

  if (!data.some((item) => item.value)) return <div className="admin-viz-empty">Registration history will appear here as members join.</div>;
  return (
    <div className="admin-area-chart">
      <div className="admin-area-readout"><strong>{active?.value || 0}</strong><span>{active?.label} · {suffix}</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Member registrations by month">
        <defs>
          <linearGradient id="raiAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2579f5" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#2579f5" stopOpacity="0.015" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((lineIndex) => <line key={lineIndex} x1={left} x2={width - right} y1={top + lineIndex * 50} y2={top + lineIndex * 50} className="admin-area-gridline" />)}
        <path d={area} fill="url(#raiAreaGradient)" />
        <path d={line} className="admin-area-line" />
        {points.map((point, index) => (
          <g
            key={point.label}
            role="button"
            tabIndex="0"
            aria-label={`${point.label}: ${point.value} ${suffix}`}
            onMouseEnter={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
            onClick={() => setActiveIndex(index)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setActiveIndex(index); }}
          >
            <circle cx={point.x} cy={point.y} r={activeIndex === index ? 6 : 3.5} className={activeIndex === index ? "is-active" : ""} />
            <text x={point.x} y={height - 10} textAnchor="middle">{point.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DonutChart({ data, suffix }) {
  const items = data.filter((item) => item.value > 0).slice(0, 6);
  const [activeLabel, setActiveLabel] = useState(items[0]?.label || "");
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    cursor += (item.value / Math.max(total, 1)) * 100;
    return `${CHART_COLORS[index]} ${start}% ${cursor}%`;
  });
  const active = items.find((item) => item.label === activeLabel) || items[0];

  if (!items.length) return <div className="admin-viz-empty">Member distribution will appear here.</div>;
  return (
    <div className="admin-donut-layout">
      <div className="admin-donut" style={{ background: `conic-gradient(${stops.join(",")})` }}>
        <div><strong>{active?.value || total}</strong><span>{active?.label || suffix}</span></div>
      </div>
      <div className="admin-donut-legend">
        {items.map((item, index) => (
          <button key={item.label} type="button" className={active?.label === item.label ? "is-active" : ""} onMouseEnter={() => setActiveLabel(item.label)} onFocus={() => setActiveLabel(item.label)} onClick={() => setActiveLabel(item.label)}>
            <i style={{ background: CHART_COLORS[index] }} /><span title={item.label}>{item.label}</span><strong>{Math.round((item.value / total) * 100)}%</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function ColumnChart({ data, suffix }) {
  const [activeLabel, setActiveLabel] = useState(data.reduce((best, item) => item.value > (best?.value ?? -1) ? item : best, null)?.label || "");
  const max = Math.max(...data.map((item) => item.value), 1);
  const active = data.find((item) => item.label === activeLabel);
  return (
    <div className="admin-column-chart">
      <div className="admin-column-readout"><strong>{active?.value || 0}</strong><span>{active?.label || "Select a column"} · {suffix}</span></div>
      <div className="admin-column-plot">
        {data.map((item) => (
          <button key={item.label} type="button" className={activeLabel === item.label ? "is-active" : ""} onMouseEnter={() => setActiveLabel(item.label)} onFocus={() => setActiveLabel(item.label)} onClick={() => setActiveLabel(item.label)} aria-label={`${item.label}: ${item.value} ${suffix}`}>
            <span><i style={{ height: `${Math.max(item.value ? 8 : 2, (item.value / max) * 100)}%` }} /></span><small>{item.label}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function RankedProgress({ data, suffix }) {
  const [activeLabel, setActiveLabel] = useState(data[0]?.label || "");
  const max = Math.max(...data.map((item) => item.value), 1);
  if (!data.length) return <div className="admin-viz-empty">Member distribution will appear here.</div>;
  return (
    <div className="admin-ranked-progress">
      {data.slice(0, 7).map((item, index) => (
        <button key={item.label} type="button" className={activeLabel === item.label ? "is-active" : ""} onMouseEnter={() => setActiveLabel(item.label)} onFocus={() => setActiveLabel(item.label)} onClick={() => setActiveLabel(item.label)}>
          <span className="admin-rank-number">{String(index + 1).padStart(2, "0")}</span>
          <span className="admin-rank-copy"><strong title={item.label}>{item.label}</strong><i><b style={{ width: `${(item.value / max) * 100}%` }} /></i></span>
          <span className="admin-rank-value">{item.value}<small>{suffix}</small></span>
        </button>
      ))}
    </div>
  );
}

export default function AdminAnalytics({ onNavigate, initialData }) {
  const [dataset, setDataset] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setDataset(initialData); }, [initialData]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDataset(await loadAdminWorkspace(supabase, publicContent));
    } catch (loadError) {
      setError(loadError.message || "Analytics could not be refreshed.");
    } finally {
      setLoading(false);
    }
  }, []);

  const analytics = useMemo(() => {
    const registrations = dataset?.registrations || [];
    const events = dataset?.events || [];
    const accepted = registrations.filter((row) => String(row.status).toLowerCase() === "accepted");
    const pending = registrations.filter((row) => !row.status || String(row.status).toLowerCase() === "pending").length;
    const departments = groupRows(registrations, (row) => row.department);
    const years = groupRows(registrations, (row) => getYearOfStudyLabel(row.years_of_study) || `Year ${row.years_of_study}`);
    const filieres = groupRows(registrations, (row) => row.filiere);
    const timestampedRegistrations = registrations.filter(
      (row) => row.created_at && !Number.isNaN(new Date(row.created_at).getTime()),
    );
    const registrationMonths = groupRows(
      timestampedRegistrations,
      (row) => MONTHS[new Date(row.created_at).getMonth()],
      MONTHS,
    );
    const datedEvents = events.map((row) => ({ row, date: parseEventDate(row) }));
    const eventYears = groupRows(datedEvents.filter((item) => item.date.year), (item) => String(item.date.year));
    const eventMonths = groupRows(datedEvents.filter((item) => item.date.month !== null), (item) => MONTHS[item.date.month], MONTHS);
    return { pending, members: accepted.length, applicants: registrations.length, departments, years, filieres, registrationMonths, eventYears, eventMonths };
  }, [dataset]);

  const leader = (data) => data.reduce((best, item) => item.value > (best?.value ?? -1) ? item : best, null);
  const metrics = [
    { label: "Team profiles", value: dataset?.team?.length || 0, target: "team", note: "Public leadership", tone: "blue" },
    { label: "Active members", value: analytics.members, target: "registrations", note: "Accepted members", tone: "cyan" },
    { label: "Pending reviews", value: analytics.pending, target: "registrations", note: "Needs a decision", tone: "violet" },
    { label: "Club events", value: dataset?.events?.length || 0, target: "events", note: "Published records", tone: "navy" },
  ];

  return (
    <div className="admin-tab-content admin-overview-infographic">
      <div className="admin-overview-hero">
        <div className="admin-overview-hero-copy">
          <span className="admin-overview-mini-logo"><img src="/RAI/club-icon-light.png" alt="" /></span>
          <div><p className="admin-eyebrow">CLUB INTELLIGENCE CENTER</p><h1>Welcome to the RAI dashboard</h1><span>One live view of your team, membership, registration, and event activity.</span></div>
        </div>
        <div className="admin-overview-hero-actions">
          <span className={`admin-intake-indicator ${dataset?.settings?.is_open ? "is-open" : "is-closed"}`}><i />Registration {dataset?.settings?.is_open ? "open" : "closed"}</span>
          <button className="admin-hero-refresh" type="button" onClick={load} disabled={loading}>{loading ? "Syncing…" : "Sync live data ↻"}</button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert">{error}</div>}

      <div className="admin-infographic-kpis">
        {metrics.map((metric, index) => (
          <button key={metric.label} className={`admin-infographic-kpi is-${metric.tone}`} type="button" onClick={() => onNavigate(metric.target)}>
            <span><small>0{index + 1}</small><i>↗</i></span><strong>{metric.value}</strong><b>{metric.label}</b><small>{metric.note}</small>
          </button>
        ))}
      </div>

      <div className="admin-infographic-grid">
        <VizCard className="is-trend" eyebrow="APPLICATION TREND" title="Registrations through the year" subtitle="All applications grouped by submission month" leader={leader(analytics.registrationMonths)?.value ? `Peak · ${leader(analytics.registrationMonths).label}` : "Waiting for data"}>
          <AreaTrend data={analytics.registrationMonths} suffix="applications" />
        </VizCard>

        <VizCard className="is-departments" eyebrow="APPLICANT MIX" title="Department share" subtitle="All registration requests" leader={`${analytics.applicants} total`}>
          <DonutChart data={analytics.departments} suffix="applicants" />
        </VizCard>

        <VizCard className="is-event-months" eyebrow="EVENT RHYTHM" title="Most active event months" subtitle="Activity across every recorded year" leader={leader(analytics.eventMonths)?.value ? `${leader(analytics.eventMonths).label} leads` : "No activity"}>
          <ColumnChart data={analytics.eventMonths} suffix="events" />
        </VizCard>

        <VizCard className="is-filieres" eyebrow="ACADEMIC PROGRAMMES" title="Filière representation" subtitle="Programmes ranked by applicants" leader={leader(analytics.filieres)?.label || "Waiting for data"}>
          <RankedProgress data={analytics.filieres} suffix="applicants" />
        </VizCard>

        <VizCard className="is-study-years" eyebrow="STUDY LEVELS" title="Applicants by study year" subtitle="Current application distribution" leader={leader(analytics.years)?.label || "Waiting for data"}>
          <DonutChart data={analytics.years} suffix="applicants" />
        </VizCard>

        <VizCard className="is-event-years" eyebrow="YEARLY ACTIVITY" title="Events by year" subtitle="Compare the club's busiest years" leader={leader(analytics.eventYears)?.value ? `${leader(analytics.eventYears).label} · ${leader(analytics.eventYears).value}` : "No activity"}>
          <ColumnChart data={analytics.eventYears} suffix="events" />
        </VizCard>
      </div>
    </div>
  );
}
