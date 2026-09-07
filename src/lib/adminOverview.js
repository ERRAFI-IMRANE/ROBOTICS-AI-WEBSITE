import { readClubSettings } from "./clubSettings.js";
import { withRequestTimeout } from "./requestTimeout.js";

// A settings/setup failure must never hide independent, existing club records.
export async function loadAdminOverview(client, contentClient = client) {
  const results = await Promise.allSettled([
    contentClient.from("team").select("id", { count: "exact", head: true }),
    client.from("members").select("id", { count: "exact", head: true }),
    client.from("registrations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    contentClient.from("events").select("*").order("id", { ascending: false }),
    readClubSettings(contentClient),
  ].map((request, index) => withRequestTimeout(request, ["Staff", "Members", "Applications", "Events", "Season settings"][index])));
  const labels = ["Staff", "Members", "Applications", "Events"];
  const errors = [];
  const rows = results.slice(0, 4).map((result, index) => {
    const error = result.status === "rejected" ? result.reason : result.value.error;
    if (error) { errors.push(labels[index] + ": " + (error.message || "Could not load data.")); return null; }
    return result.value;
  });
  const settingsResult = results[4];
  return {
    staff: rows[0]?.count ?? null,
    members: rows[1]?.count ?? null,
    pending: rows[2]?.count ?? null,
    events: rows[3] ? rows[3].data || [] : null,
    settings: settingsResult.status === "fulfilled" ? settingsResult.value : null,
    settingsWarning: settingsResult.status === "rejected" ? settingsResult.reason.message : "",
    errors,
  };
}
