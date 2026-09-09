import React, { useCallback, useEffect, useMemo, useState } from "react";
import { eventView } from "../../lib/adminEvents";
import { loadAdminWorkspace } from "../../lib/adminWorkspace";
import { publicContent, supabase } from "../../lib/supabaseClient";
import ChartPanel from "./overview/ChartPanel";
import EventBarChart from "./overview/EventBarChart";
import MetricCard from "./overview/MetricCard";
import RecentActivityTable from "./overview/RecentActivityTable";
import RegistrationLineChart from "./overview/RegistrationLineChart";
import StatusDoughnutChart from "./overview/StatusDoughnutChart";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LOOKUP = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  janvier: 0, fevrier: 1, "février": 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, "août": 7, septembre: 8, octobre: 9, novembre: 10,
  decembre: 11, "décembre": 11,
};

function parseEventDate(row) {
  const event = eventView(row);
  const raw = String(event.date || row.created_at || "").trim();
  const parsed = raw ? new Date(raw) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return { date: parsed, month: parsed.getMonth() };
  const monthMatch = raw.toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec|janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\b/);
  return { date: null, month: monthMatch ? MONTH_LOOKUP[monthMatch[1]] : null };
}

function monthCounts(rows, getMonth) {
  const counts = Array(12).fill(0);
  rows.forEach((row) => {
    const month = getMonth(row);
    if (Number.isInteger(month) && month >= 0 && month < 12) counts[month] += 1;
  });
  return counts;
}

function statusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (["accepted", "completed"].includes(normalized)) return "positive";
  if (["refused", "error"].includes(normalized)) return "critical";
  return "warning";
}

function formatActivityDate(value, fallback = "Date not set") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminAnalytics({ onNavigate, initialData, permissions = [] }) {
  const [dataset, setDataset] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canReviewRegistrations = permissions.includes("registrations");

  useEffect(() => { setDataset(initialData); }, [initialData]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDataset(await loadAdminWorkspace(supabase, publicContent, () => {}, permissions));
    } catch (loadError) {
      setError(loadError.message || "The overview could not be refreshed.");
    } finally {
      setLoading(false);
    }
  }, [permissions]);

  const analytics = useMemo(() => {
    const registrations = dataset?.registrations || [];
    const events = dataset?.events || [];
    const statusCounts = registrations.reduce((counts, row) => {
      const status = String(row.status || "pending").toLowerCase();
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
    const registrationMonths = monthCounts(registrations, (row) => {
      const date = row.created_at ? new Date(row.created_at) : null;
      return date && !Number.isNaN(date.getTime()) ? date.getMonth() : null;
    });
    const eventMonths = monthCounts(events, (row) => parseEventDate(row).month);

    const activities = [
      ...registrations.map((row) => ({
        id: `registration-${row.id}`,
        timestamp: row.created_at ? new Date(row.created_at).getTime() : 0,
        title: row.full_name || "Unnamed applicant",
        detail: [row.department, row.filiere].filter(Boolean).join(", ") || "Membership application",
        category: "Registration",
        status: row.status || "pending",
        tone: statusTone(row.status || "pending"),
        date: formatActivityDate(row.created_at),
      })),
      ...events.map((row) => {
        const event = eventView(row);
        const parsed = parseEventDate(row);
        return {
          id: `event-${row.id}`,
          timestamp: parsed.date?.getTime() || (row.created_at ? new Date(row.created_at).getTime() : 0),
          title: event.title || "Untitled event",
          detail: event.description || "Club event",
          category: "Event",
          status: event.status,
          tone: statusTone(event.status),
          date: parsed.date ? formatActivityDate(parsed.date) : event.date || "Date not set",
        };
      }),
    ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);

    return {
      registrations,
      events,
      accepted: statusCounts.accepted || 0,
      pending: statusCounts.pending || 0,
      registrationMonths,
      eventMonths,
      statusValues: [statusCounts.pending || 0, statusCounts.accepted || 0, statusCounts.refused || 0],
      activities,
    };
  }, [dataset]);

  const busiestRegistrationMonth = Math.max(...analytics.registrationMonths, 0);
  const busiestEventMonth = Math.max(...analytics.eventMonths, 0);

  return (
    <div className="admin-tab-content admin-overview-page">
      <div className="admin-overview-heading">
        <div><h1>Overview</h1><p>Membership and event operations at a glance.</p></div>
        <div className="admin-overview-actions">
          <span className={`admin-intake-status ${dataset?.settings?.is_open ? "is-open" : "is-closed"}`}><i />Applications {dataset?.settings?.is_open ? "open" : "closed"}</span>
          <button className="btn-secondary" type="button" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh data"}</button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert">{error}</div>}

      <div className="admin-metric-widget-grid">
        <MetricCard label="Team profiles" value={dataset?.team?.length || 0} note="Published leadership profiles" tone="blue" onClick={permissions.includes("team") ? () => onNavigate("team") : undefined} />
        {canReviewRegistrations && <MetricCard label="Accepted members" value={analytics.accepted} note="Approved registration records" tone="teal" onClick={() => onNavigate("registrations")} />}
        {canReviewRegistrations && <MetricCard label="Pending reviews" value={analytics.pending} note="Applications awaiting action" tone="amber" onClick={() => onNavigate("registrations")} />}
        <MetricCard label="Club events" value={analytics.events.length} note="Published event records" tone="slate" onClick={permissions.includes("events") ? () => onNavigate("events") : undefined} />
      </div>

      <div className="admin-chart-widget-grid">
        {canReviewRegistrations && <ChartPanel className="is-wide" title="Registration activity" description="Applications received by month" summary={busiestRegistrationMonth ? `${busiestRegistrationMonth} in the busiest month` : "No applications yet"}>
          <RegistrationLineChart labels={MONTHS} values={analytics.registrationMonths} />
        </ChartPanel>}
        <ChartPanel title="Event cadence" description="Events grouped by calendar month" summary={busiestEventMonth ? `${busiestEventMonth} at peak` : "No dated events"}>
          <EventBarChart labels={MONTHS} values={analytics.eventMonths} />
        </ChartPanel>
        {canReviewRegistrations && <ChartPanel title="Application status" description="Current review distribution" summary={`${analytics.registrations.length} total`}>
          <StatusDoughnutChart labels={["Pending", "Accepted", "Refused"]} values={analytics.statusValues} total={analytics.registrations.length} />
        </ChartPanel>}
      </div>

      <RecentActivityTable rows={analytics.activities} />
    </div>
  );
}
