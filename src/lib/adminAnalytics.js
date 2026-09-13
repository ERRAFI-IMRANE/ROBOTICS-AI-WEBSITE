import { normalizeTeamSeason } from "../constants/teamPosts.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TEAM_CELL_ORDER = [
  "Leadership / Supervision",
  "Media",
  "Design",
  "Organization",
  "Communication",
  "Financial",
  "Secretary",
  "Photography",
  "Active Members",
];
const POST_CELL = Object.freeze({
  PRES: "Leadership / Supervision",
  VP: "Leadership / Supervision",
  SUP: "Leadership / Supervision",
  "CO-SUP": "Leadership / Supervision",
  ADV: "Leadership / Supervision",
  MENTOR: "Leadership / Supervision",
  "MED-PRES": "Media",
  "MED-VP": "Media",
  SMM: "Media",
  "VID-EDIT": "Media",
  "DES-PRES": "Design",
  "DES-VP": "Design",
  PHOTO: "Photography",
  "SEC-PRES": "Secretary",
  "SEC-VP": "Secretary",
  "ORG-PRES": "Organization",
  "ORG-VP": "Organization",
  "EVT-COORD": "Organization",
  "COM-PRES": "Communication",
  "COM-VP": "Communication",
  FDBK: "Communication",
  "FIN-PRES": "Financial",
  "FIN-VP": "Financial",
  MEM: "Active Members",
});

function cleanLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizedKey(value) {
  return cleanLabel(value).normalize("NFKC").toLocaleLowerCase("fr");
}

function toChartSeries(counts) {
  return [...counts.values()]
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "fr"));
}

export function countLabels(rows, field) {
  const counts = new Map();
  rows.forEach((row) => {
    const label = cleanLabel(row?.[field]);
    const key = normalizedKey(label);
    if (!key) return;
    const current = counts.get(key);
    if (current) current.value += 1;
    else counts.set(key, { label, value: 1 });
  });
  return toChartSeries(counts);
}

export function filterRegistrationsBySeason(rows, season) {
  if (!season) return rows;
  return rows.filter((row) => cleanLabel(row.registration_season) === season);
}

export function genderDistribution(team) {
  const counts = { Male: 0, Female: 0, unknown: 0 };
  team.forEach((member) => {
    const sex = cleanLabel(member.sex).toUpperCase();
    if (sex === "M") counts.Male += 1;
    else if (sex === "F") counts.Female += 1;
    else counts.unknown += 1;
  });
  return counts;
}

export function teamCellForPost(value) {
  return POST_CELL[cleanLabel(value).toUpperCase()] || "";
}

export function teamStructure(team, season, { includeEmpty = false } = {}) {
  const counts = new Map(includeEmpty ? TEAM_CELL_ORDER.map((label) => [label, { label, value: 0 }]) : []);
  const seen = new Set();
  team.forEach((member) => {
    const assignments = Array.isArray(member.team_seasons) ? member.team_seasons : [];
    assignments.forEach((assignment) => {
      const assignmentSeason = normalizeTeamSeason(assignment.season) || cleanLabel(assignment.season);
      const requestedSeason = normalizeTeamSeason(season) || cleanLabel(season);
      if (requestedSeason && assignmentSeason !== requestedSeason) return;
      const label = teamCellForPost(assignment.post_abbr);
      if (!label) return;
      const identity = `${member.id}:${assignmentSeason}:${label}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      const current = counts.get(label) || { label, value: 0 };
      current.value += 1;
      counts.set(label, current);
    });
  });
  if (!includeEmpty) return toChartSeries(counts);
  return [...counts.values()].sort((a, b) => {
    const indexA = TEAM_CELL_ORDER.indexOf(a.label);
    const indexB = TEAM_CELL_ORDER.indexOf(b.label);
    if (indexA === -1 || indexB === -1) return indexA === -1 ? 1 : -1;
    return indexA - indexB;
  });
}

export function registrationDecisionStats(registrations) {
  const counts = registrations.reduce((result, row) => {
    const status = cleanLabel(row.status).toLowerCase();
    if (Object.hasOwn(result, status)) result[status] += 1;
    return result;
  }, { accepted: 0, refused: 0, pending: 0 });
  const decided = counts.accepted + counts.refused;
  return {
    ...counts,
    decided,
    acceptanceRate: decided ? (counts.accepted / decided) * 100 : null,
  };
}

function utcDay(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function dateLabel(date) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function monthLabel(date) {
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
}

export function applicationsTimeline(registrations) {
  const dates = registrations.map((row) => utcDay(row.created_at)).filter(Boolean).sort((a, b) => a - b);
  if (!dates.length) return { labels: [], values: [], granularity: "day", peak: null };

  const first = dates[0];
  const last = dates[dates.length - 1];
  const spanDays = Math.round((last - first) / DAY_MS);
  const daily = spanDays <= 120;
  const counts = new Map();
  dates.forEach((date) => {
    const key = daily ? dateKey(date) : monthKey(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const points = [];
  const cursor = new Date(first);
  if (daily) {
    while (cursor <= last) {
      const key = dateKey(cursor);
      points.push({ key, label: dateLabel(cursor), value: counts.get(key) || 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else {
    cursor.setUTCDate(1);
    const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
    while (cursor <= end) {
      const key = monthKey(cursor);
      points.push({ key, label: monthLabel(cursor), value: counts.get(key) || 0 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  const peak = points.reduce((best, point) => point.value > (best?.value ?? -1) ? point : best, null);
  return {
    labels: points.map((point) => point.label),
    values: points.map((point) => point.value),
    granularity: daily ? "day" : "month",
    peak,
  };
}

export function eventsByYear(events) {
  const counts = new Map();
  events.forEach((event) => {
    const match = cleanLabel(event.date).match(/(?:^|\D)((?:19|20)\d{2})(?!\d)/);
    if (!match) return;
    const year = match[1];
    counts.set(year, (counts.get(year) || 0) + 1);
  });
  return [...counts.entries()]
    .sort(([yearA], [yearB]) => Number(yearA) - Number(yearB))
    .map(([label, value]) => ({ label, value }));
}

export function availableTeamSeasons(team) {
  return [...new Set(team.flatMap((member) => member.team_seasons || []).map((row) => normalizeTeamSeason(row.season) || cleanLabel(row.season)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

export function resolveRelevantSeason(preferredSeason, availableSeasons) {
  if (preferredSeason && availableSeasons.includes(preferredSeason)) return preferredSeason;
  return availableSeasons[0] || preferredSeason || "";
}
