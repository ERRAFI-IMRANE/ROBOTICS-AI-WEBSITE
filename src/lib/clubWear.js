const EMPTY_ITEM = Object.freeze({ status: "available", issued_at: null, returned_at: null, updated_at: null });

function normalizeItem(item) {
  if (!item || !["available", "issued", "returned"].includes(item.status)) return { ...EMPTY_ITEM };
  return {
    status: item.status,
    issued_at: item.issued_at || null,
    returned_at: item.returned_at || null,
    updated_at: item.updated_at || null,
  };
}

export function normalizeClubWearWorkspace(data) {
  return {
    season: typeof data?.season === "string" ? data.season : "",
    seasons: Array.isArray(data?.seasons) ? data.seasons.filter((season) => typeof season === "string") : [],
    members: Array.isArray(data?.members) ? data.members.map((member) => ({
      ...member,
      tshirt: normalizeItem(member?.tshirt),
      hoodie: normalizeItem(member?.hoodie),
    })) : [],
  };
}

function clubWearError(error) {
  if (["PGRST202", "42883"].includes(error?.code)) {
    return new Error("Club wear is not configured yet. Run supabase/migration_club_wear.sql in the Supabase SQL editor.");
  }
  if (["42P01", "PGRST205"].includes(error?.code)) {
    return new Error("The club wear table is missing. Run supabase/migration_club_wear.sql in the Supabase SQL editor.");
  }
  return new Error(error?.message || "Club wear data could not be loaded.");
}

export async function loadClubWearWorkspace(client, season = "") {
  const { data, error } = await client.rpc("get_club_wear_workspace", { p_season: season || null });
  if (error) throw clubWearError(error);
  return normalizeClubWearWorkspace(data);
}

export async function setClubWearItem(client, { teamId, season, itemType, issued }) {
  if (!teamId || !season || !["tshirt", "hoodie"].includes(itemType)) {
    throw new Error("Choose a valid member, season, and clothing item.");
  }
  const { data, error } = await client.rpc("set_club_wear_item", {
    p_team_id: teamId,
    p_season: season,
    p_item_type: itemType,
    p_issued: Boolean(issued),
  });
  if (error) throw clubWearError(error);
  if (!data || String(data.team_id) !== String(teamId) || data.item_type !== itemType) {
    throw new Error("The clothing update was not confirmed. Refresh and try again.");
  }
  return data;
}
