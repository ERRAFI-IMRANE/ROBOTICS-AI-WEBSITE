export function normalizeSeason(value) {
  const match = String(value || "").trim().match(/^(?:20)?(\d{2})[-/](?:20)?(\d{2})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return "";
  return `20${match[1]}-20${match[2]}`;
}

export const shortSeason = (value) => normalizeSeason(value).replace(/20(\d{2})/g, "$1");

export async function readClubSettings(client) {
  const { data, error } = await client.from("club_settings")
    .select("current_season, public_staff_season").eq("id", 1).single();
  if (error) {
    if (["PGRST205", "42P01", "PGRST116"].includes(error.code)) throw new Error("Season settings are not configured or not visible to this account. Apply supabase/admin_rebuild.sql and check officer permissions. Existing staff and events do not require this table to load.");
    throw new Error("Could not load season settings: " + (error.message || "Check your connection and officer permissions."));
  }
  if (!data) throw new Error("No season settings row exists. Apply supabase/admin_rebuild.sql to configure seasons.");
  return data;
}

export async function saveClubSettings(client, values) {
  const current = normalizeSeason(values.current_season);
  const staff = normalizeSeason(values.public_staff_season);
  if (!current || !staff) throw new Error("Use consecutive academic years, for example 2026-2027.");
  const { data, error } = await client.rpc("save_club_settings", {
    p_current_season: current, p_public_staff_season: staff,
  });
  if (error) throw new Error(error.message || "Settings could not be saved.");
  if (!data || data.current_season !== current || data.public_staff_season !== staff) throw new Error("Settings update was not confirmed. Refresh before retrying.");
  return data;
}

export async function decideRegistration(client, id, decision, reason = "") {
  if (!id || !["accepted", "refused"].includes(decision)) throw new Error("Choose a valid application and decision.");
  if (decision === "refused" && !reason.trim()) throw new Error("Please enter a reason for refusal.");
  const { data, error } = await client.rpc("decide_club_registration", {
    p_registration_id: id, p_decision: decision, p_reason: reason.trim() || null,
  });
  if (error) throw new Error(error.code === "PGRST202" ? "Apply the admin rebuild SQL to enable atomic admission decisions." : error.message);
  if (!data || String(data.registration_id) !== String(id) || data.decision !== decision) throw new Error("The decision was not confirmed. Refresh the queue before retrying.");
  return data;
}
