import React, { useCallback, useEffect, useMemo, useState } from "react";
import { eventView, parseEventDate } from "../../lib/adminEvents";
import { loadAdminWorkspace } from "../../lib/adminWorkspace";
import { publicContent, supabase } from "../../lib/supabaseClient";
import ChartPanel from "./overview/ChartPanel";
import EventBarChart from "./overview/EventBarChart";
import MetricCard from "./overview/MetricCard";
import RecentActivityTable from "./overview/RecentActivityTable";
import RegistrationLineChart from "./overview/RegistrationLineChart";
import StatusDoughnutChart from "./overview/StatusDoughnutChart";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
    const eventMonths = monthCounts(events, (row) => parseEventDate(row)?.getUTCMonth());

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
          timestamp: parsed?.getTime() || (row.created_at ? new Date(row.created_at).getTime() : 0),
          title: event.title || "Untitled event",
          detail: event.link ? "Published with an event link" : "Published club event",
          category: "Event",
          status: "Published",
          tone: "positive",
          date: parsed ? formatActivityDate(parsed) : event.date || "Date not set",
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
