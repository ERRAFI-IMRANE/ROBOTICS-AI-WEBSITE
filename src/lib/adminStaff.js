export async function saveStaff(client, id, profile, seasons) {
  if (!profile.full_name?.trim() || !seasons.length) throw new Error("A name and at least one season are required.");
  if (seasons.some((row) => row.post_order !== null && (!Number.isInteger(row.post_order) || row.post_order < 0))) throw new Error("Staff ordering must be a non-negative whole number.");
  const { data, error } = await client.rpc("save_club_staff", { p_team_id: id || null, p_profile: profile, p_seasons: seasons });
  if (error) throw new Error(error.code === "PGRST202" ? "Apply the admin rebuild SQL to enable staff saves." : error.message);
  if (!data?.id) throw new Error("Staff save was not confirmed. Reload before retrying.");
  return data;
}
export async function deleteStaff(client, id, season = null) {
  const { data, error } = await client.rpc("delete_club_staff", { p_team_id: id, p_season: season });
  if (error) throw new Error(error.code === "PGRST202" ? "Apply the admin rebuild SQL to enable staff deletion." : error.message);
  if (String(data?.id) !== String(id)) throw new Error("Staff deletion was not confirmed.");
}
