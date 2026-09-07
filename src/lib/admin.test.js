import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSeason, shortSeason, saveClubSettings, decideRegistration } from "./clubSettings.js";
import { eventPayload, eventView, safeEventUrl, saveEvent, deleteEvent } from "./adminEvents.js";
import { saveStaff, deleteStaff } from "./adminStaff.js";
import { readRegistrationSettings } from "./registration.js";
import { loadAdminOverview } from "./adminOverview.js";
import { withRequestTimeout } from "./requestTimeout.js";

const form = { title: " Robotics day ", date: "13 June 2026", image_url: "/events/workshop.png", link: "https://example.com/event", status: "Completed", description: "Club event" };
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
test("settings use one atomic RPC with independent current and published seasons", async () => {
  const data = { current_season: "2026-2027", public_staff_season: "2025-2026" };
  const client = rpcMock({ data, error: null });
  assert.deepEqual(await saveClubSettings(client, data), data);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].name, "save_club_settings");
  await assert.rejects(saveClubSettings(client, { ...data, current_season: "bad" }));
});
test("admissions call the atomic endpoint exactly once", async () => {
  const client = rpcMock({ data: { registration_id: 15, decision: "accepted" }, error: null });
  await decideRegistration(client, 15, "accepted");
  assert.deepEqual(client.calls, [{ name: "decide_club_registration", args: { p_registration_id: 15, p_decision: "accepted", p_reason: null } }]);
});
test("refusal requires a reason and never performs a partial fallback", async () => {
  const client = rpcMock({ data: null, error: { code: "PGRST202" } });
  await assert.rejects(decideRegistration(client, 15, "refused", " "), /reason/);
  assert.equal(client.calls.length, 0);
  await assert.rejects(decideRegistration(client, 15, "refused", "Not eligible"), /SQL/);
  assert.equal(client.calls.length, 1);
});
test("wrong or missing admission confirmation is not a success", async () => {
  await assert.rejects(decideRegistration(rpcMock({ data: null }), 2, "accepted"), /not confirmed/);
  await assert.rejects(decideRegistration(rpcMock({ data: { registration_id: 3, decision: "accepted" } }), 2, "accepted"));
});
test("legacy unclassified events are completed", () => {
  assert.equal(eventView({ id: 1, data: '{"title":"Workshop"}' }).status, "Completed");
  assert.equal(eventView({ data: { status: "Upcoming" } }).status, "Upcoming");
});
test("event edits preserve unrelated JSON and synchronize public image and link columns", () => {
  const row = { id: 1, data: { title: "Old", venue: "EST Safi", links: "old" }, image_url: "/old.png", links: "old" };
  const payload = eventPayload(form, row);
  assert.equal(payload.data.venue, "EST Safi");
  assert.equal(payload.data.title, "Robotics day");
  assert.equal(payload.image_url, form.image_url);
  assert.equal(payload.links, form.link);
  assert.equal(payload.data.links, form.link);
  assert.equal(payload.id, undefined);
  assert.equal(payload.title, undefined);
});
test("flat event schema uses only supported columns", () => {
  const payload = eventPayload(form, { id: 2, title: "Old", date: "", link: "", image: "", status: "Completed" });
  assert.equal(payload.title, "Robotics day");
  assert.equal(payload.data, undefined);
  assert.equal(payload.image_url, undefined);
});
test("unsafe links and transient image blobs are rejected", () => {
  assert.equal(safeEventUrl("javascript:alert(1)"), "");
  assert.equal(safeEventUrl("//evil.example", true), "");
  assert.equal(safeEventUrl("blob:https://local/123", true), "");
  assert.throws(() => eventPayload({ ...form, link: "bad" }, null), /URL/);
});
test("event save verifies the database response, with no pretend local fallback", async () => {
  const good = tableMock({ data: { id: 1 }, error: null });
  await saveEvent(good, form, { id: 1, data: {} });
  assert.ok(good.calls.some((call) => call[0] === "eq" && call[2] === 1));
  await assert.rejects(saveEvent(tableMock({ error: { message: "denied" } }), form, null), /denied/);
});
test("event delete cannot report success for zero affected rows", async () => {
  await assert.rejects(deleteEvent(tableMock({ data: null }), 1), /not confirmed/);
  await deleteEvent(tableMock({ data: { id: 1 }, error: null }), 1);
});
test("staff save and season-only delete preserve the existing workflow through atomic RPCs", async () => {
  const client = rpcMock({ data: { id: 8 }, error: null });
  await saveStaff(client, 8, { full_name: "Test Staff" }, [{ season: "26-27", role: "Lead", post_order: 1 }]);
  await deleteStaff(client, 8, "26-27");
  assert.equal(client.calls[0].name, "save_club_staff");
  assert.deepEqual(client.calls[1], { name: "delete_club_staff", args: { p_team_id: 8, p_season: "26-27" } });
  await assert.rejects(saveStaff(client, null, { full_name: "Test" }, [{ post_order: 1.5 }]), /whole number/);
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
      : { error: null, count: 12, data: table === "events" ? [{ id: 1, data: { title: "Existing event" } }] : { current_season: "2026-2027", public_staff_season: "2025-2026" } };
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
  assert.deepEqual(privateTables.sort(), ["members", "registrations"]);
});
test("stalled requests produce an actionable timeout instead of loading forever", async () => {
  await assert.rejects(withRequestTimeout(new Promise(() => {}), "Events", 5), /Events timed out/);
  assert.equal(await withRequestTimeout(Promise.resolve(18), "Events", 50), 18);
});
