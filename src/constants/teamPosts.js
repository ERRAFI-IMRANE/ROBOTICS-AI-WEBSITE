export const TEAM_POSTS = Object.freeze([
  { role: "Club Supervisor", post_abbr: "SUP", post_order: 1 },
  { role: "Club Co-Supervisor", post_abbr: "CO-SUP", post_order: 2 },
  { role: "Advisor", post_abbr: "ADV", post_order: 3 },
  { role: "Club President", post_abbr: "PRES", post_order: 4 },
  { role: "Club Vice President", post_abbr: "VP", post_order: 5 },
  { role: "Main Mentor", post_abbr: "MENTOR", post_order: 6 },
  { role: "President of the Media Cell", post_abbr: "MED-PRES", post_order: 7 },
  { role: "Vice President of the Media Cell", post_abbr: "MED-VP", post_order: 8 },
  { role: "Social Media Manager", post_abbr: "SMM", post_order: 9 },
  { role: "Video Editor", post_abbr: "VID-EDIT", post_order: 10 },
  { role: "President of the Design Cell", post_abbr: "DES-PRES", post_order: 11 },
  { role: "Vice President of the Design Cell", post_abbr: "DES-VP", post_order: 12 },
  { role: "Photographer", post_abbr: "PHOTO", post_order: 13 },
  { role: "President of the Secretary Cell", post_abbr: "SEC-PRES", post_order: 14 },
  { role: "Vice President of the Secretary Cell", post_abbr: "SEC-VP", post_order: 15 },
  { role: "President of the Organization Cell", post_abbr: "ORG-PRES", post_order: 16 },
  { role: "Vice President of the Organization Cell", post_abbr: "ORG-VP", post_order: 17 },
  { role: "Event Coordinator", post_abbr: "EVT-COORD", post_order: 18 },
  { role: "President of the Communication Cell", post_abbr: "COM-PRES", post_order: 19 },
  { role: "Vice President of the Communication Cell", post_abbr: "COM-VP", post_order: 20 },
  { role: "President of the Financial Cell", post_abbr: "FIN-PRES", post_order: 21 },
  { role: "Vice President of the Financial Cell", post_abbr: "FIN-VP", post_order: 22 },
  { role: "Feedbacker", post_abbr: "FDBK", post_order: 23 },
  { role: "Active Member", post_abbr: "MEM", post_order: 24 },
]);

export const TEAM_SEASONS = Object.freeze([
  "2023-2024",
  "2024-2025",
  "2025-2026",
  "2026-2027",
]);

export const DEFAULT_TEAM_SEASON = "2025-2026";

const ROLE_ALIASES = Object.freeze({
  president: "Club President",
  "vice president": "Club Vice President",
  "vise president": "Club Vice President",
  "media vice president": "Vice President of the Media Cell",
  "president design cell": "President of the Design Cell",
  "secretary president": "President of the Secretary Cell",
  "secretary vice president": "Vice President of the Secretary Cell",
  "president of the oraganization cell": "President of the Organization Cell",
  "vice president of the oraganization cell": "Vice President of the Organization Cell",
  "vise president of the communication cell": "Vice President of the Communication Cell",
  "socia media manager": "Social Media Manager",
  "event cordinator": "Event Coordinator",
  feedbaker: "Feedbacker",
  "team member": "Active Member",
  "active member": "Active Member",
});

export function normalizeTeamRole(value) {
  const role = String(value || "").trim();
  if (!role) return "";
  const normalizedRole = role.toLowerCase();
  const exact = TEAM_POSTS.find((post) => post.role.toLowerCase() === normalizedRole);
  if (exact) return exact.role;
  return ROLE_ALIASES[normalizedRole] || "";
}

export function getTeamPost(value) {
  const role = normalizeTeamRole(value);
  return TEAM_POSTS.find((post) => post.role === role) || null;
}

export function normalizeTeamSeason(value) {
  const match = String(value || "").trim().match(/^(?:20)?(\d{2})[-/](?:20)?(\d{2})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return "";
  return `20${match[1]}-20${match[2]}`;
}

// Alternate keys are for reading legacy rows only. All UI state and writes use
// the first, full four-digit value.
export function getEquivalentTeamSeasonKeys(value) {
  const season = normalizeTeamSeason(value);
  if (!season) return [];
  const start = season.slice(2, 4);
  const end = season.slice(7, 9);
  return [season, `${start}-${end}`, `${start}/${end}`, season.slice(0, 4), start];
}

export function createTeamAssignment(seasonValue, roleValue) {
  const rawSeason = String(seasonValue || "").trim();
  const season = normalizeTeamSeason(seasonValue);
  const post = getTeamPost(roleValue);
  if (rawSeason !== season || !TEAM_SEASONS.includes(season)) {
    throw new Error("Choose a season in YYYY-YYYY format.");
  }
  if (!post) throw new Error("Choose a valid team post.");
  return {
    season,
    role: post.role,
    post_abbr: post.post_abbr,
    post_order: post.post_order,
  };
}
