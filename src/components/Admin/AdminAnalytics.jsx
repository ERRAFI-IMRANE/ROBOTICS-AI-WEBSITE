import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  applicationsTimeline,
  availableTeamSeasons,
  countLabels,
  completedInterviewRegistrations,
  eventsByYear,
  filterRegistrationsBySeason,
  genderDistribution,
  interestingCandidateCount,
  interviewAnswerDistribution,
  registrationDecisionStats,
  resolveRelevantSeason,
  teamStructure,
} from "../../lib/adminAnalytics";
import { eventView, parseEventDate } from "../../lib/adminEvents";
import { loadAdminWorkspace } from "../../lib/adminWorkspace";
import { INTERVIEW_QUESTIONS } from "../../lib/registrationInterview";
import { publicContent, supabase } from "../../lib/supabaseClient";
import AnalyticsBarChart from "./overview/AnalyticsBarChart";
import AnalyticsDoughnutChart from "./overview/AnalyticsDoughnutChart";
import ChartPanel from "./overview/ChartPanel";
import EventBarChart from "./overview/EventBarChart";
import MetricCard from "./overview/MetricCard";
import RecentActivityTable from "./overview/RecentActivityTable";
import RegistrationLineChart from "./overview/RegistrationLineChart";
import { chartPalette } from "./overview/chartSetup";

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

function AnalyticsEmpty({ children }) {
  return <div className="admin-chart-empty">{children}</div>;
}

function dynamicChartHeight(items, minimum = 270) {
  return Math.max(minimum, items.length * 34 + 54);
}

const FILIERE_COLORS = ["#1d4ed8", "#0f766e", "#d97706", "#6d5bd0", "#0e7490", "#be185d", "#475467", "#65a30d", "#c2410c", "#0369a1"];
const INTERVIEW_OPTIONS = Object.freeze(Object.fromEntries(INTERVIEW_QUESTIONS.map((question) => [question.field, question.options])));

function seriesTotal(series) {
  return series.reduce((total, item) => total + item.value, 0);
}

export default function AdminAnalytics({ onNavigate, initialData, permissions = [] }) {
  const [dataset, setDataset] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTeamSeason, setSelectedTeamSeason] = useState("");
  const [selectedRegistrationSeason, setSelectedRegistrationSeason] = useState("");
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
    const team = dataset?.team || [];
    const allRegistrations = dataset?.registrations || [];
    const events = dataset?.events || [];
    const configuredRegistrationSeason = String(dataset?.settings?.season || "").trim();
    const registrationSeasons = [...new Set([
      configuredRegistrationSeason,
      ...allRegistrations.map((row) => String(row.registration_season || "").trim()),
    ].filter(Boolean))]
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const defaultRegistrationSeason = configuredRegistrationSeason || registrationSeasons[0] || "";
    const registrationSeason = selectedRegistrationSeason === "all"
      ? ""
      : registrationSeasons.includes(selectedRegistrationSeason) ? selectedRegistrationSeason : defaultRegistrationSeason;
    const registrationSeasonValue = selectedRegistrationSeason === "all" ? "all" : registrationSeason || "all";
    const registrations = filterRegistrationsBySeason(allRegistrations, registrationSeason);
    const teamSeasons = availableTeamSeasons(team);
    const teamSeason = resolveRelevantSeason(selectedTeamSeason || registrationSeason, teamSeasons);
    const genders = genderDistribution(team);
    const cells = teamStructure(team, teamSeason, { includeEmpty: true });
    const decisions = registrationDecisionStats(registrations);
    const departments = countLabels(registrations, "department");
    const filieres = countLabels(registrations, "filiere");
    const timeline = applicationsTimeline(registrations);
    const eventYears = eventsByYear(events);
    const completedInterviews = completedInterviewRegistrations(registrations);
    const interestingCandidates = interestingCandidateCount(registrations);
    const interests = interviewAnswerDistribution(registrations, "interest_type", INTERVIEW_OPTIONS.interest_type, { multiple: true });
    const personalities = interviewAnswerDistribution(registrations, "team_role_style", INTERVIEW_OPTIONS.team_role_style);
    const problemSolving = interviewAnswerDistribution(registrations, "problem_solving_style", INTERVIEW_OPTIONS.problem_solving_style);
    const workEnvironments = interviewAnswerDistribution(registrations, "work_environment", INTERVIEW_OPTIONS.work_environment);
    const preferredActivities = interviewAnswerDistribution(registrations, "preferred_activity", INTERVIEW_OPTIONS.preferred_activity, { multiple: true });

    const activities = [
      ...allRegistrations.map((row) => ({
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
      team, registrations, events, registrationSeason, registrationSeasonValue, registrationSeasons,
      teamSeason, teamSeasons, genders, cells, decisions, departments, filieres, timeline, eventYears,
      completedInterviews, interestingCandidates, interests, personalities, problemSolving, workEnvironments,
      preferredActivities, activities,
    };
  }, [dataset, selectedRegistrationSeason, selectedTeamSeason]);

  const genderTotal = analytics.genders.Male + analytics.genders.Female;
  const malePercentage = genderTotal ? Math.round((analytics.genders.Male / genderTotal) * 100) : 0;
  const femalePercentage = genderTotal ? 100 - malePercentage : 0;
  const cellMemberCount = analytics.cells.reduce((sum, cell) => sum + cell.value, 0);
  const representedCellCount = analytics.cells.filter((cell) => cell.value > 0).length;
  const filiereTotal = analytics.filieres.reduce((sum, item) => sum + item.value, 0);
  const teamContext = analytics.teamSeason || "all available seasons";
  const registrationContext = analytics.registrationSeason || "all registration history";
  const timelinePeak = analytics.timeline.peak?.value
    ? `${analytics.timeline.peak.value} on ${analytics.timeline.peak.label}`
    : "No applications yet";
  const interviewContext = `${analytics.completedInterviews.length} completed interview${analytics.completedInterviews.length === 1 ? "" : "s"}`;

  return (
    <div className="admin-tab-content admin-overview-page">
      <div className="admin-overview-heading">
        <div><h1>Overview</h1><p>Membership, recruitment and event operations from live club data.</p></div>
        <div className="admin-overview-actions">
          <span className={`admin-intake-status ${dataset?.settings?.is_open ? "is-open" : "is-closed"}`}><i />Applications {dataset?.settings?.is_open ? "open" : "closed"}</span>
          <button className="btn-secondary" type="button" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh data"}</button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert">{error}</div>}

      <div className="admin-metric-widget-grid">
        <MetricCard label="Team profiles" value={analytics.team.length} note="Stored club profiles" tone="blue" onClick={permissions.includes("team") ? () => onNavigate("team") : undefined} />
        {canReviewRegistrations && <MetricCard label="Accepted members" value={analytics.decisions.accepted} note={`Recruitment ${registrationContext}`} tone="teal" onClick={() => onNavigate("registrations")} />}
        {canReviewRegistrations && <MetricCard label="Pending reviews" value={analytics.decisions.pending} note={`Recruitment ${registrationContext}`} tone="amber" onClick={() => onNavigate("registrations")} />}
        {canReviewRegistrations && <MetricCard label="Interesting Candidates" value={analytics.interestingCandidates} note={`Internal flag · ${registrationContext}`} tone="gold" onClick={() => onNavigate("registrations")} />}
        <MetricCard label="Club events" value={analytics.events.length} note="Published event records" tone="slate" onClick={permissions.includes("events") ? () => onNavigate("events") : undefined} />
      </div>

      <div className="admin-analytics-scope" aria-label="Analytics scope">
        <span><b>Team structure</b>{teamContext}</span>
        {canReviewRegistrations && <label className="admin-analytics-scope-select">
          <b>Recruitment</b>
          <select value={analytics.registrationSeasonValue} onChange={(event) => setSelectedRegistrationSeason(event.target.value)} aria-label="Registration analytics season">
            <option value="all">All seasons</option>
            {analytics.registrationSeasons.map((season) => <option key={season} value={season}>{season}</option>)}
          </select>
        </label>}
        <span><b>Gender</b>All stored profiles</span>
      </div>

      <div className="admin-chart-widget-grid admin-analytics-grid">
        {canReviewRegistrations && <ChartPanel className="is-wide" title="Applications over time" description={`Submission volume by ${analytics.timeline.granularity}`} summary={timelinePeak}>
          {analytics.timeline.values.length
            ? <RegistrationLineChart labels={analytics.timeline.labels} values={analytics.timeline.values} />
            : <AnalyticsEmpty>No dated applications are available for {registrationContext}.</AnalyticsEmpty>}
        </ChartPanel>}

        {canReviewRegistrations && <ChartPanel title="Decision acceptance rate" description="Pending applications are excluded" summary={analytics.decisions.decided ? `${analytics.decisions.accepted} accepted · ${analytics.decisions.refused} refused` : "No reviewed applications"}>
          {analytics.decisions.decided
            ? <AnalyticsDoughnutChart labels={["Accepted", "Refused"]} values={[analytics.decisions.accepted, analytics.decisions.refused]} colors={[chartPalette.teal, chartPalette.red]} centerValue={`${Math.round(analytics.decisions.acceptanceRate)}%`} centerLabel="Acceptance" datasetLabel="Decisions" ariaLabel={`Acceptance rate ${Math.round(analytics.decisions.acceptanceRate)} percent`} />
            : <AnalyticsEmpty>The acceptance rate will appear after the first decision.</AnalyticsEmpty>}
        </ChartPanel>}

        <ChartPanel title="Team gender distribution" description="Male and female profiles across the stored team" summary={analytics.genders.unknown ? `${analytics.genders.unknown} unclassified omitted` : `${genderTotal} classified profiles`}>
          {genderTotal
            ? <AnalyticsDoughnutChart labels={[`Male — ${malePercentage}%`, `Female — ${femalePercentage}%`]} values={[analytics.genders.Male, analytics.genders.Female]} colors={[chartPalette.blue, "#0f9f9a"]} centerValue={`${malePercentage}%`} centerLabel="Male" datasetLabel="Profiles" ariaLabel={`${malePercentage} percent male and ${femalePercentage} percent female team profiles`} />
            : <AnalyticsEmpty>No classified team profiles are available.</AnalyticsEmpty>}
        </ChartPanel>

        <ChartPanel
          className="is-wide"
          title="Team structure by cell"
          description={`Functional distribution for ${teamContext}`}
          summary={cellMemberCount ? `${representedCellCount} represented groups` : "No assignments"}
          action={analytics.teamSeasons.length ? <label className="admin-chart-season-select">
            <span>Season</span>
            <select value={analytics.teamSeason} onChange={(event) => setSelectedTeamSeason(event.target.value)} aria-label="Team structure season">
              {analytics.teamSeasons.map((season) => <option key={season} value={season}>{season}</option>)}
            </select>
          </label> : null}
          height={dynamicChartHeight(analytics.cells, 350)}
        >
          {cellMemberCount
            ? <AnalyticsBarChart horizontal labels={analytics.cells.map((item) => item.label)} values={analytics.cells.map((item) => item.value)} datasetLabel="Members" color={chartPalette.blue} ariaLabel={`Team structure by cell for ${teamContext}`} />
            : <AnalyticsEmpty>No team assignments are available for {teamContext}.</AnalyticsEmpty>}
        </ChartPanel>

        {canReviewRegistrations && <ChartPanel title="Applications by department" description={`Recruitment mix for ${registrationContext}`} summary={analytics.departments[0] ? `${analytics.departments[0].label} leads with ${analytics.departments[0].value}` : "No department data"} height={360}>
          {analytics.departments.length
            ? <AnalyticsBarChart horizontal labels={analytics.departments.map((item) => item.label)} values={analytics.departments.map((item) => item.value)} datasetLabel="Applications" color={chartPalette.teal} ariaLabel={`Applications by department for ${registrationContext}`} />
            : <AnalyticsEmpty>No department data is available for this recruitment season.</AnalyticsEmpty>}
        </ChartPanel>}

        {canReviewRegistrations && <ChartPanel title="Applications by filière" description={`Academic programmes represented in ${registrationContext}`} summary={analytics.filieres[0] ? `${analytics.filieres[0].label} leads with ${analytics.filieres[0].value}` : "No filière data"} height={360}>
          {analytics.filieres.length
            ? <AnalyticsDoughnutChart labels={analytics.filieres.map((item) => item.label)} values={analytics.filieres.map((item) => item.value)} colors={FILIERE_COLORS} centerValue={filiereTotal} centerLabel="Applications" datasetLabel="Applications" ariaLabel={`Applications by filière for ${registrationContext}`} />
            : <AnalyticsEmpty>No filière data is available for this recruitment season.</AnalyticsEmpty>}
        </ChartPanel>}

        {canReviewRegistrations && <div className="admin-analytics-grid-heading">
          <div><p className="admin-eyebrow">Interview analytics</p><h2>Candidate preferences</h2></div>
          <span>{interviewContext} · {registrationContext}</span>
        </div>}

        {canReviewRegistrations && <ChartPanel className="is-wide" title="Interests / hobbies" description="Every selected interest is counted for interviewed candidates" summary={seriesTotal(analytics.interests) ? `${seriesTotal(analytics.interests)} selections` : "No answers"} height={dynamicChartHeight(analytics.interests, 300)}>
          {seriesTotal(analytics.interests)
            ? <AnalyticsBarChart horizontal labels={analytics.interests.map((item) => item.label)} values={analytics.interests.map((item) => item.value)} datasetLabel="Candidates" color={chartPalette.blue} ariaLabel={`Interview interests for ${registrationContext}`} />
            : <AnalyticsEmpty>No completed interview interest answers are available for {registrationContext}.</AnalyticsEmpty>}
        </ChartPanel>}

        {canReviewRegistrations && <ChartPanel title="Team personality" description="How interviewed candidates describe their team role" summary={seriesTotal(analytics.personalities) ? interviewContext : "No answers"} height={dynamicChartHeight(analytics.personalities, 300)}>
          {seriesTotal(analytics.personalities)
            ? <AnalyticsBarChart horizontal labels={analytics.personalities.map((item) => item.label)} values={analytics.personalities.map((item) => item.value)} datasetLabel="Candidates" color={chartPalette.teal} ariaLabel={`Team personality answers for ${registrationContext}`} />
            : <AnalyticsEmpty>No completed team personality answers are available for {registrationContext}.</AnalyticsEmpty>}
        </ChartPanel>}

        {canReviewRegistrations && <ChartPanel title="Problem solving style" description="Preferred response when facing a new problem" summary={seriesTotal(analytics.problemSolving) ? interviewContext : "No answers"} height={dynamicChartHeight(analytics.problemSolving, 300)}>
          {seriesTotal(analytics.problemSolving)
            ? <AnalyticsBarChart horizontal labels={analytics.problemSolving.map((item) => item.label)} values={analytics.problemSolving.map((item) => item.value)} datasetLabel="Candidates" color="#475467" ariaLabel={`Problem solving answers for ${registrationContext}`} />
            : <AnalyticsEmpty>No completed problem-solving answers are available for {registrationContext}.</AnalyticsEmpty>}
        </ChartPanel>}

        {canReviewRegistrations && <ChartPanel title="Preferred work environment" description="The setting where candidates expect to contribute best" summary={seriesTotal(analytics.workEnvironments) ? interviewContext : "No answers"} height={dynamicChartHeight(analytics.workEnvironments, 300)}>
          {seriesTotal(analytics.workEnvironments)
            ? <AnalyticsBarChart horizontal labels={analytics.workEnvironments.map((item) => item.label)} values={analytics.workEnvironments.map((item) => item.value)} datasetLabel="Candidates" color={chartPalette.amber} ariaLabel={`Preferred work environment answers for ${registrationContext}`} />
            : <AnalyticsEmpty>No completed work-environment answers are available for {registrationContext}.</AnalyticsEmpty>}
        </ChartPanel>}

        {canReviewRegistrations && <ChartPanel title="Preferred club activities" description="Every selected activity is counted for interviewed candidates" summary={seriesTotal(analytics.preferredActivities) ? `${seriesTotal(analytics.preferredActivities)} selections` : "No answers"} height={dynamicChartHeight(analytics.preferredActivities, 300)}>
          {seriesTotal(analytics.preferredActivities)
            ? <AnalyticsBarChart horizontal labels={analytics.preferredActivities.map((item) => item.label)} values={analytics.preferredActivities.map((item) => item.value)} datasetLabel="Candidates" color="#6d5bd0" ariaLabel={`Preferred club activity answers for ${registrationContext}`} />
            : <AnalyticsEmpty>No completed preferred-activity answers are available for {registrationContext}.</AnalyticsEmpty>}
        </ChartPanel>}

        <ChartPanel className="is-wide" title="Club activity by year" description="Safely extracted from the legacy event date text" summary={analytics.eventYears.length ? `${analytics.eventYears.at(-1).label} is the latest recorded year` : "No usable event years"}>
          {analytics.eventYears.length
            ? <EventBarChart labels={analytics.eventYears.map((item) => item.label)} values={analytics.eventYears.map((item) => item.value)} />
            : <AnalyticsEmpty>No event records contain a usable four-digit year.</AnalyticsEmpty>}
        </ChartPanel>
      </div>

      <RecentActivityTable rows={analytics.activities} />
    </div>
  );
}
