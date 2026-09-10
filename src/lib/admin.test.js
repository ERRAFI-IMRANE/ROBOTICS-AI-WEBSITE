import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { normalizeSeason, shortSeason, saveClubSettings, decideRegistration } from "./clubSettings.js";
import { deleteEvent, eventPayload, eventView, formatDateForDatabase, formatDateForInput, parseEventDate, safeEventUrl, saveEvent } from "./adminEvents.js";
import { saveStaff, deleteStaff } from "./adminStaff.js";
import { readRegistrationSettings } from "./registration.js";
import { loadAdminOverview } from "./adminOverview.js";
import { withRequestTimeout } from "./requestTimeout.js";
import { getAdminPermissions, hasAdminPermission } from "./adminPermissions.js";
import { createAdminUser, updateAdminUser } from "./adminUsers.js";
import {
  TEAM_POSTS,
  TEAM_SEASONS,
  createTeamAssignment,
  normalizeTeamRole,
} from "../constants/teamPosts.js";
import { ALBUM_PHOTOS, pickRandomAlbumPhotos } from "../data/albumPhotos.js";

const form = { title: " Robotics day ", date: "2026-06-13", image_url: "https://media.example.com/EVENTS/event.webp", link: "https://example.com/event" };

test("album manifest includes every folder image and selects seven unique cards", () => {
  const files = readdirSync(new URL("../../public/album/", import.meta.url))
    .filter((name) => /\.(?:jpe?g|png|webp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const manifestFiles = ALBUM_PHOTOS.map((photo) => photo.src.split("/").pop())
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const selection = pickRandomAlbumPhotos(7);
  assert.deepEqual(manifestFiles, files);
  assert.equal(selection.length, 7);
  assert.equal(new Set(selection.map((photo) => photo.src)).size, 7);
});
function rpcMock(result) {
  const calls = [];
  return { calls, async rpc(name, args) { calls.push({ name, args }); return result; } };
}
function tableMock(result) {
  const calls = [];
  const query = {
    update(payload) { calls.push(["update", payload]); return query; },
    insert(payload) { calls.push(["insert", payload]); return query; },
    delete() { calls.push(["delete"]); return query; },
    eq(key, value) { calls.push(["eq", key, value]); return query; },
    select() { return query; }, async single() { return result; },
  };
  return { calls, from(table) { calls.push(["table", table]); return query; } };
}
test("season keys normalize and require consecutive years", () => {
  assert.equal(normalizeSeason("26-27"), "2026-2027");
  assert.equal(normalizeSeason("2027/2028"), "2027-2028");
  assert.equal(normalizeSeason("2026-2028"), "");
  assert.equal(shortSeason("2027-2028"), "27-28");
});
test("controlled team posts generate internal metadata and full season keys", () => {
  assert.equal(TEAM_POSTS.length, 24);
  assert.deepEqual(TEAM_SEASONS, ["2023-2024", "2024-2025", "2025-2026", "2026-2027"]);
  assert.deepEqual(createTeamAssignment("2025-2026", "Photographer"), {
    season: "2025-2026",
    role: "Photographer",
    post_abbr: "PHOTO",
    post_order: 13,
  });
  assert.equal(normalizeTeamRole("Media Vice President"), "Vice President of the Media Cell");
  assert.equal(normalizeTeamRole("President of the Oraganization Cell"), "President of the Organization Cell");
  assert.equal(normalizeTeamRole("club co-supervisor"), "Club Co-Supervisor");
  assert.throws(() => createTeamAssignment("25-26", "Photographer"), /YYYY-YYYY/);
  assert.throws(() => createTeamAssignment("2025-2026", "Unknown role"), /post/);
});
test("settings use one atomic RPC with independent current and published seasons", async () => {
  const data = { current_season: "2026-2027", public_staff_season: "2025-2026" };
  const client = rpcMock({ data, error: null });
  assert.deepEqual(await saveClubSettings(client, data), data);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].name, "save_club_settings");
  await assert.rejects(saveClubSettings(client, { ...data, current_season: "bad" }));
});
test("admissions update the registration through one atomic decision endpoint", async () => {
  const client = rpcMock({ data: { registration_id: 15, decision: "accepted" }, error: null });
  await decideRegistration(client, 15, "accepted");
  assert.deepEqual(client.calls, [{ name: "decide_club_registration", args: { p_registration_id: 15, p_decision: "accepted", p_reason: null } }]);
});
test("refusal requires a reason and never performs a partial fallback", async () => {
  const client = rpcMock({ data: null, error: { code: "PGRST202" } });
  await assert.rejects(decideRegistration(client, 15, "refused", " "), /reason/);
  assert.equal(client.calls.length, 0);
  await assert.rejects(decideRegistration(client, 15, "refused", "Not eligible"), /migration/);
  assert.equal(client.calls.length, 1);
});
test("refusal sends the trimmed reason with no secondary table write", async () => {
  const client = rpcMock({ data: { registration_id: 15, decision: "refused" }, error: null });
  await decideRegistration(client, 15, "refused", "  Incomplete application  ");
  assert.deepEqual(client.calls, [{ name: "decide_club_registration", args: { p_registration_id: 15, p_decision: "refused", p_reason: "Incomplete application" } }]);
});
test("wrong or missing admission confirmation is not a success", async () => {
  await assert.rejects(decideRegistration(rpcMock({ data: null }), 2, "accepted"), /not confirmed/);
  await assert.rejects(decideRegistration(rpcMock({ data: { registration_id: 3, decision: "accepted" } }), 2, "accepted"));
});
test("single-table migration updates registration history without copying or deleting applicants", () => {
  const migration = readFileSync(new URL("../../supabase/migration_registrations_single_table.sql", import.meta.url), "utf8");
  assert.match(migration, /UPDATE public\.registrations[\s\S]*SET status = p_decision/);
  assert.match(migration, /refusal_reason = CASE WHEN p_decision = 'refused'/);
  assert.doesNotMatch(migration, /INSERT INTO public\.(?:members|refused_members)/);
  assert.doesNotMatch(migration, /DELETE FROM public\.registrations/);
  assert.doesNotMatch(migration, /public\.club_settings/);
});
test("team and event migration grants admin CRUD while keeping public users read-only", () => {
  const migration = readFileSync(new URL("../../supabase/migration_admin_team_events_crud.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE POLICY club_admin_manage[\s\S]*FOR ALL TO authenticated/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.%I FROM anon/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.save_club_staff/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.delete_club_staff/);
  assert.doesNotMatch(migration, /service_role/);
});
test("admin permission helpers preserve legacy access and restrict granular accounts", () => {
  const legacy = { app_metadata: { club_admin: true } };
  const eventsOfficer = { app_metadata: { club_admin: true, club_permissions: ["events"] } };
  assert.equal(hasAdminPermission(legacy, "users"), true);
  assert.deepEqual(getAdminPermissions(eventsOfficer), ["overview", "events"]);
  assert.equal(hasAdminPermission(eventsOfficer, "team"), false);
  assert.deepEqual(getAdminPermissions({ app_metadata: {} }), []);
});
test("admin user calls go through the protected Edge Function", async () => {
  const calls = [];
  const client = { functions: { async invoke(name, options) {
    calls.push({ name, body: options.body });
    return { data: { ok: true, user: { id: "admin-id" } }, error: null };
  } } };
  await createAdminUser(client, { email: "admin@example.com", password: "password123", permissions: ["events"] });
  await updateAdminUser(client, "admin-id", { permissions: ["team"] });
  assert.deepEqual(calls.map((call) => call.name), ["admin-users", "admin-users"]);
  assert.deepEqual(calls.map((call) => call.body.action), ["create", "update"]);
});
test("granular permission migration protects writes and the service key remains server-side", () => {
  const migration = readFileSync(new URL("../../supabase/migration_admin_user_permissions.sql", import.meta.url), "utf8");
  const edgeFunction = readFileSync(new URL("../../supabase/functions/admin-users/index.ts", import.meta.url), "utf8");
  const browserClient = readFileSync(new URL("./adminUsers.js", import.meta.url), "utf8");
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.has_club_permission/);
  assert.match(migration, /public\.has_club_permission\('registrations'\)/);
  assert.match(migration, /public\.has_club_permission\('team'\)/);
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edgeFunction, /userClient\.auth\.getUser\(\)/);
  assert.match(edgeFunction, /adminClient\.auth\.admin\.(?:listUsers|createUser|updateUserById)/);
  assert.doesNotMatch(browserClient, /SERVICE_ROLE/);
});
test("flat event views ignore removed legacy fields", () => {
  const row = { id: 3, title: "Workshop", date: "09/04/2026", image_url: "https://media.example.com/EVENTS/a.webp", link: "https://example.com", created_at: "2026-01-01T00:00:00Z", data: { title: "Wrong" }, status: "Completed" };
  assert.deepEqual(eventView(row), {
    id: 3,
    title: "Workshop",
    date: "09/04/2026",
    image_url: "https://media.example.com/EVENTS/a.webp",
    link: "https://example.com",
    created_at: "2026-01-01T00:00:00Z",
  });
});
test("event payload contains only current database columns", () => {
  assert.deepEqual(eventPayload(form), {
    title: "Robotics day",
    date: "13/06/2026",
    image_url: form.image_url,
    link: form.link,
  });
});
test("event date helpers round-trip and parse legacy ranges", () => {
  assert.equal(formatDateForDatabase("2026-04-09"), "09/04/2026");
  assert.equal(formatDateForInput("09/04/2026"), "2026-04-09");
  assert.equal(formatDateForInput("13-14 Oct 2024"), "");
  assert.equal(parseEventDate("13-14 Oct 2024")?.toISOString(), "2024-10-13T00:00:00.000Z");
  assert.throws(() => formatDateForDatabase("2026-02-30"), /valid/);
});
test("unsafe links and transient image blobs are rejected", () => {
  assert.equal(safeEventUrl("javascript:alert(1)"), "");
  assert.equal(safeEventUrl("//evil.example", true), "");
  assert.equal(safeEventUrl("blob:https://local/123", true), "");
  assert.throws(() => eventPayload({ ...form, link: "bad" }, null), /URL/);
});
test("event save verifies the database response, with no pretend local fallback", async () => {
  const good = tableMock({ data: { id: 1 }, error: null });
  await saveEvent(good, form, { id: 1 });
  assert.ok(good.calls.some((call) => call[0] === "eq" && call[2] === 1));
  await assert.rejects(saveEvent(tableMock({ error: { message: "denied" } }), form, null), /denied/);
});
test("event delete cannot report success for zero affected rows", async () => {
  await assert.rejects(deleteEvent(tableMock({ data: null }), 1), /not confirmed/);
  await deleteEvent(tableMock({ data: { id: 1 }, error: null }), 1);
});
test("staff save and season-only delete preserve the existing workflow through atomic RPCs", async () => {
  const client = rpcMock({ data: { id: 8 }, error: null });
  await saveStaff(client, 8, { full_name: "Test Staff", sex: "F" }, [{ season: "2026-2027", role: "Photographer", post_abbr: "WRONG", post_order: 99 }]);
  await deleteStaff(client, 8, "2026-2027");
  assert.equal(client.calls[0].name, "save_club_staff");
  assert.deepEqual(client.calls[0].args.p_seasons, [{ season: "2026-2027", role: "Photographer", post_abbr: "PHOTO", post_order: 13 }]);
  assert.deepEqual(client.calls[1], { name: "delete_club_staff", args: { p_team_id: 8, p_season: "2026-2027" } });
  await assert.rejects(
    saveStaff(client, null, { full_name: "Test", sex: "M" }, [{ season: "2026-2027", role: "Unknown role" }]),
    /valid.*post/,
  );
  await assert.rejects(
    saveStaff(client, null, { full_name: "Test", sex: "X" }, [{ season: "2026-2027", role: "Active Member" }]),
    /Male or Female/,
  );
});
test("missing staff RPC falls back to confirmed writes in team and team_seasons", async () => {
  const calls = [];
  let storedAssignments = [];
  const client = {
    async rpc() { return { data: null, error: { code: "PGRST202", message: "Function was not found" } }; },
    from(table) {
      if (table === "team") return {
        insert(payload) {
          calls.push(["team.insert", payload]);
          return { select() { return { async single() { return { data: { id: 42 }, error: null }; } }; } };
        },
        update(payload) {
          calls.push(["team.update", payload]);
          return { eq() { return { select() { return { async single() { return { data: { id: 42 }, error: null }; } }; } }; } };
        },
        delete() { return { async eq() { calls.push(["team.cleanup"]); return { error: null }; } }; },
      };
      return {
        upsert(rows, options) {
          calls.push(["team_seasons.upsert", rows, options]);
          storedAssignments = rows.map((row, index) => ({ id: index + 1, ...row }));
          return { async select() { return { data: storedAssignments, error: null }; } };
        },
        select() {
          return { async eq() { return { data: storedAssignments.map(({ id, season }) => ({ id, season })), error: null }; } };
        },
        delete() { return { async in() { return { error: null }; } }; },
      };
    },
  };
  const result = await saveStaff(client, null, { full_name: "New Staff", sex: "M" }, [{ season: "2026-2027", role: "Photographer" }]);
  assert.equal(result.id, 42);
  assert.equal(result.fallback, true);
  assert.equal(calls[0][0], "team.insert");
  assert.equal(calls[1][0], "team_seasons.upsert");
  assert.equal(calls[1][1][0].team_id, 42);
  assert.equal(calls[1][1][0].post_abbr, "PHOTO");
});
test("controlled Team migration atomically writes and confirms both Team tables", () => {
  const migration = readFileSync(new URL("../../supabase/migration_team_controlled_fields.sql", import.meta.url), "utf8");
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /INSERT INTO public\.team\(/);
  assert.match(migration, /INSERT INTO public\.team_seasons\(/);
  assert.match(migration, /ON CONFLICT \(team_id, season\) DO UPDATE/);
  assert.match(migration, /season_count/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.club_settings/);
  assert.match(migration, /club_public_event_media_read/);
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/);
});
test("Join follows selected current season rather than latest chronological season", async () => {
  const filters = [];
  const client = { from(table) {
    const query = { select() { return query; }, eq(key, value) { filters.push([table, key, value]); return query; }, async maybeSingle() { return { data: table === "club_settings" ? { current_season: "2025-2026" } : { id: 1, season: "2025-2026", is_open: true }, error: null }; } };
    return query;
  } };
  const settings = await readRegistrationSettings(client);
  assert.equal(settings.season, "2025-2026");
  assert.ok(filters.some(([table, key, value]) => table === "registration_settings" && key === "season" && value === "2025-2026"));
});

function overviewMock(failedTable) {
  return { from(table) {
    const result = table === failedTable ? { error: { code: "PGRST205", message: "Table is not available" }, data: null, count: null }
      : { error: null, count: 12, data: table === "events" ? [{ id: 1, title: "Existing event", date: "09/04/2026", image_url: "/events/workshop.png", link: "", created_at: null }] : { current_season: "2026-2027", public_staff_season: "2025-2026" } };
    const chain = { select() { return chain; }, eq() { return chain; }, order() { return chain; }, single() { return Promise.resolve(result); }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
    return chain;
  } };
}
test("missing club_settings never hides existing staff and events", async () => {
  const result = await loadAdminOverview(overviewMock("club_settings"));
  assert.equal(result.staff, 12);
  assert.equal(result.events[0].id, 1);
  assert.equal(result.settings, null);
  assert.ok(result.settingsWarning);
  assert.deepEqual(result.errors, []);
});
test("a failed admissions count does not block staff or events", async () => {
  const result = await loadAdminOverview(overviewMock("registrations"));
  assert.equal(result.pending, null);
  assert.equal(result.staff, 12);
  assert.equal(result.events.length, 1);
  assert.match(result.errors[0], /Applications/);
});
test("failed events query stays unavailable rather than a fake empty list", async () => {
  const result = await loadAdminOverview(overviewMock("events"));
  assert.equal(result.events, null);
  assert.equal(result.staff, 12);
  assert.match(result.errors[0], /Events/);
});

test("overview uses the public reader only for public content", async () => {
  const publicTables = [];
  const privateTables = [];
  const publicMock = overviewMock();
  const privateMock = overviewMock();
  const contentClient = { from(table) { publicTables.push(table); return publicMock.from(table); } };
  const authClient = { from(table) { privateTables.push(table); return privateMock.from(table); } };
  await loadAdminOverview(authClient, contentClient);
  assert.deepEqual(publicTables.sort(), ["club_settings", "events", "team"]);
  assert.deepEqual(privateTables.sort(), ["registrations", "registrations"]);
});
test("stalled requests produce an actionable timeout instead of loading forever", async () => {
  await assert.rejects(withRequestTimeout(new Promise(() => {}), "Events", 5), /Events timed out/);
  assert.equal(await withRequestTimeout(Promise.resolve(18), "Events", 50), 18);
});
