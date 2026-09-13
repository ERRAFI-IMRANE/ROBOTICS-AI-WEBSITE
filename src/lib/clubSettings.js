export function normalizeSeason(value) {
  const match = String(value || "").trim().match(/^(?:20)?(\d{2})[-/](?:20)?(\d{2})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return "";
  return `20${match[1]}-20${match[2]}`;
}

export const shortSeason = (value) => normalizeSeason(value).replace(/20(\d{2})/g, "$1");

export function normalizePublishedSeasons(settings) {
  const candidates = Array.isArray(settings?.public_staff_seasons)
    ? settings.public_staff_seasons
    : [settings?.public_staff_season];
  return [...new Set(candidates.map(normalizeSeason).filter(Boolean))];
}

export async function readClubSettings(client) {
  let { data, error } = await client.from("club_settings")
    .select("current_season, public_staff_season, public_staff_seasons").eq("id", 1).single();
  if (error && ["42703", "PGRST204"].includes(error.code)) {
    ({ data, error } = await client.from("club_settings")
      .select("current_season, public_staff_season").eq("id", 1).single());
  }
  if (error) {
    if (["PGRST205", "42P01", "PGRST116"].includes(error.code)) throw new Error("Season settings are not configured or not visible to this account. Apply supabase/admin_rebuild.sql and check officer permissions. Existing staff and events do not require this table to load.");
    throw new Error("Could not load season settings: " + (error.message || "Check your connection and officer permissions."));
  }
  if (!data) throw new Error("No season settings row exists. Apply supabase/admin_rebuild.sql to configure seasons.");
  const publicStaffSeasons = normalizePublishedSeasons(data);
  return {
    ...data,
    public_staff_season: publicStaffSeasons[0] || "",
    public_staff_seasons: publicStaffSeasons,
  };
}

export async function saveClubSettings(client, values) {
  const current = normalizeSeason(values.current_season);
  const sourceSeasons = Array.isArray(values.public_staff_seasons)
    ? values.public_staff_seasons
    : [values.public_staff_season];
  const staffSeasons = [...new Set(sourceSeasons.map(normalizeSeason).filter(Boolean))];
  if (!current || !staffSeasons.length || staffSeasons.length !== sourceSeasons.length) {
    throw new Error("Use one or more consecutive academic seasons, for example 2026-2027.");
  }
  const { data, error } = await client.rpc("save_club_settings_seasons", {
    p_current_season: current,
    p_public_staff_seasons: staffSeasons,
  });
  if (error) {
    if (error.code === "PGRST202") throw new Error("Apply supabase/migration_multiple_public_team_seasons.sql before publishing multiple team seasons.");
    throw new Error(error.message || "Settings could not be saved.");
  }
  const savedSeasons = normalizePublishedSeasons(data);
  if (!data || data.current_season !== current || savedSeasons.join("|") !== staffSeasons.join("|")) {
    throw new Error("Settings update was not confirmed. Refresh before retrying.");
  }
  return {
    ...data,
    public_staff_season: savedSeasons[0],
    public_staff_seasons: savedSeasons,
  };
}

export async function decideRegistration(client, id, decision, reason = "") {
  if (!id || !["accepted", "refused"].includes(decision)) throw new Error("Choose a valid application and decision.");
  if (decision === "refused" && !reason.trim()) throw new Error("Please enter a reason for refusal.");
  if (reason.trim().length > 2000) throw new Error("Keep the refusal reason under 2,000 characters.");
  const { data, error } = await client.rpc("decide_club_registration", {
    p_registration_id: id, p_decision: decision, p_reason: reason.trim() || null,
  });
  if (error) throw new Error(error.code === "PGRST202" ? "Apply the single-table registrations migration to enable admission decisions." : error.message);
  if (!data || String(data.registration_id) !== String(id) || data.decision !== decision) throw new Error("The decision was not confirmed. Refresh the queue before retrying.");
  return data;
}
