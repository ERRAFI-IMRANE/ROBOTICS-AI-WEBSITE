import { normalizePublishedSeasons } from "./clubSettings.js";
import { DEFAULT_TEAM_SEASON, normalizeTeamSeason } from "../constants/teamPosts.js";

// These historical rosters remain accessible from the public year filter.
const PUBLIC_TEAM_ARCHIVE_SEASONS = ["2025-2026", "2024-2025"];

export function publicTeamSeasons(settings) {
  return [...new Set([
    ...normalizePublishedSeasons(settings),
    ...PUBLIC_TEAM_ARCHIVE_SEASONS,
  ])].sort((a, b) => b.localeCompare(a));
}

export function teamMembersForSeason(members, season) {
  const selected = normalizeTeamSeason(season);
  if (!selected) return [];
  return members.filter((member) => {
    let years = [];
    if (Array.isArray(member?.team_seasons) && member.team_seasons.length) {
      years = member.team_seasons.map((assignment) => assignment.season);
    } else if (member?.season_roles && Object.keys(member.season_roles).length) {
      years = Object.keys(member.season_roles);
    } else {
      const legacyYears = member?.years || member?.data?.years;
      if (Array.isArray(legacyYears)) years = legacyYears;
      else if (typeof legacyYears === "string") years = legacyYears.split(",");
    }
    const normalized = years.map(normalizeTeamSeason).filter(Boolean);
    return (normalized.length ? normalized : [DEFAULT_TEAM_SEASON]).includes(selected);
  });
}
