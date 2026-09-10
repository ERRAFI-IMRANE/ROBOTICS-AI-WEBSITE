import { createTeamAssignment } from "../constants/teamPosts.js";

function isMissingStaffRpc(error) {
  return error?.code === "PGRST202"
    || error?.code === "42883"
    || /save_club_staff.*(schema cache|does not exist|not found)/i.test(error?.message || "");
}

async function directStaffSave(client, id, profile, assignments) {
  const isNew = !id;
  let previousProfile = null;
  if (!isNew) {
    const { data, error } = await client.from("team").select("*").eq("id", id).single();
    if (error || !data) throw new Error(error?.message || "The current team profile could not be read before updating it.");
    previousProfile = Object.fromEntries(Object.keys(profile).map((key) => [key, data[key]]));
  }
  const profileQuery = isNew
    ? client.from("team").insert(profile).select("id").single()
    : client.from("team").update(profile).eq("id", id).select("id").single();
  const { data: savedProfile, error: profileError } = await profileQuery;
  if (profileError || !savedProfile?.id) {
    throw new Error(profileError?.message || "The member profile could not be saved in the team table.");
  }

  const staffId = savedProfile.id;
  try {
    const rows = assignments.map((assignment) => ({ ...assignment, team_id: staffId }));
    const { data: savedAssignments, error: assignmentError } = await client
      .from("team_seasons")
      .upsert(rows, { onConflict: "team_id,season" })
      .select("id, team_id, season, role, post_abbr, post_order");

    if (assignmentError || !Array.isArray(savedAssignments) || savedAssignments.length !== rows.length) {
      throw new Error(assignmentError?.message || "The member's season assignments could not be saved in team_seasons.");
    }

    const { data: existingAssignments, error: existingError } = await client
      .from("team_seasons")
      .select("id, season")
      .eq("team_id", staffId);
    if (existingError) throw new Error(existingError.message || "The saved seasons could not be verified.");

    const activeSeasons = new Set(assignments.map((assignment) => assignment.season));
    const staleIds = (existingAssignments || [])
      .filter((assignment) => !activeSeasons.has(assignment.season))
      .map((assignment) => assignment.id);
    if (staleIds.length) {
      const { error: staleError } = await client.from("team_seasons").delete().in("id", staleIds);
      if (staleError) throw new Error(staleError.message || "Old season assignments could not be removed.");
    }

    return { id: staffId, season_count: rows.length, fallback: true };
  } catch (error) {
    const rollback = isNew
      ? await client.from("team").delete().eq("id", staffId)
      : await client.from("team").update(previousProfile).eq("id", staffId);
    if (rollback.error) throw new Error(`${error.message} The team profile rollback also failed: ${rollback.error.message}`);
    throw error;
  }
}

export async function saveStaff(client, id, profile, seasons) {
  if (!profile.full_name?.trim() || !seasons.length) throw new Error("A name and at least one season are required.");
  if (!["M", "F"].includes(profile.sex)) throw new Error("Choose Male or Female.");
  const assignments = seasons.map((row) => createTeamAssignment(row.season, row.role));
  if (new Set(assignments.map((row) => row.season)).size !== assignments.length) throw new Error("Each season can only be assigned once.");
  const { data, error } = await client.rpc("save_club_staff", { p_team_id: id || null, p_profile: profile, p_seasons: assignments });
  if (error) {
    const denied = error.code === "42501" || /permission/i.test(error.message || "");
    if (isMissingStaffRpc(error)) return directStaffSave(client, id, profile, assignments);
    if (denied) throw new Error("Your admin account needs the Team permission. Update its permissions, sign out, and sign in again.");
    throw new Error(error.message || "Supabase could not save this member.");
  }
  if (!data?.id) throw new Error("Staff save was not confirmed. Reload before retrying.");
  if (data.season_count !== undefined && Number(data.season_count) !== assignments.length) {
    throw new Error("Supabase did not confirm every season assignment. Do not retry until the Team migration is applied.");
  }
  return data;
}
export async function deleteStaff(client, id, season = null) {
  const { data, error } = await client.rpc("delete_club_staff", { p_team_id: id, p_season: season });
  if (error) throw new Error(error.code === "PGRST202" ? "Apply the admin rebuild SQL to enable staff deletion." : error.message);
  if (String(data?.id) !== String(id)) throw new Error("Staff deletion was not confirmed.");
}
