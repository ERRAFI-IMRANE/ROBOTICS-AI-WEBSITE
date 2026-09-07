import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRegistration, readRegistrationSettings, submitRegistration, setRegistrationOpen } from "./registration.js";

const valid = { full_name: " Test Applicant ", email: "TEST@example.com", phone: "+212 600 000 000", department: "Informatique", filiere: "Génie Informatique", years_of_study: "2", message: "  A robot project  " };
const campaign = { id: 7, is_open: true, season: "2026-2027" };
function mockClient({ settings = campaign, settingsError = null, insertError = null, updateResult } = {}) {
  const writes = [];
  const filters = [];
  const client = { from(table) {
    const query = {
      select() { return query; }, order() { return query; }, limit() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      maybeSingle: async () => ({ data: settings, error: settingsError }),
      insert: async (payload) => { writes.push({ table, payload }); return { error: insertError }; },
      update(payload) { writes.push({ table, payload }); return query; },
      single: async () => updateResult || { data: { ...campaign, is_open: false }, error: null },
    };
    return query;
  } };
  return { client, writes, filters };
}
test("valid fields pass; incomplete fields are identified", () => {
  assert.deepEqual(validateRegistration(valid), {});
  assert.ok(validateRegistration({ ...valid, full_name: "   " }).full_name);
  assert.ok(validateRegistration({ ...valid, email: "bad", phone: "abc" }).email);
  assert.ok(validateRegistration({ ...valid, phone: "abc" }).phone);
});
test("department and year must match allowed values", () => {
  assert.ok(validateRegistration({ ...valid, department: "Maintenance Industrielle" }).filiere);
  assert.ok(validateRegistration({ ...valid, years_of_study: "first_year" }).years_of_study);
  assert.ok(validateRegistration({ ...valid, message: "x".repeat(2001) }).message);
});
test("missing campaign is closed, while read failure is an error", async () => {
  assert.deepEqual(await readRegistrationSettings(mockClient({ settings: null }).client), { is_open: false, season: null });
  await assert.rejects(readRegistrationSettings(mockClient({ settingsError: {} }).client), /could not be checked/);
});
test("submission matches live schema and normalizes values", async () => {
  const { client, writes } = mockClient();
  await submitRegistration(client, valid, campaign.season);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, "registrations");
  assert.deepEqual(writes[0].payload, { ...valid, full_name: "Test Applicant", email: "test@example.com", years_of_study: 2, message: "A robot project", status: "pending", registration_season: campaign.season });
});
test("closing or changing the campaign prevents stale submissions", async () => {
  for (const settings of [{ ...campaign, is_open: false }, { ...campaign, season: "2027-2028" }]) {
    const { client, writes } = mockClient({ settings });
    await assert.rejects(submitRegistration(client, valid, campaign.season));
    assert.equal(writes.length, 0);
  }
});
test("invalid fields never reach the database", async () => {
  const { client, writes } = mockClient();
  await assert.rejects(submitRegistration(client, { ...valid, email: "" }, campaign.season));
  assert.equal(writes.length, 0);
});
test("database errors do not report success", async () => {
  await assert.rejects(submitRegistration(mockClient({ insertError: { code: "23505" } }).client, valid, campaign.season), /already exists/);
  await assert.rejects(submitRegistration(mockClient({ insertError: { code: "42501" } }).client, valid, campaign.season), /couldn't confirm/);
});
test("closing targets the campaign, not applicants, and verifies the result", async () => {
  const { client, writes, filters } = mockClient();
  await setRegistrationOpen(client, campaign, false);
  assert.equal(writes[0].table, "registration_settings");
  assert.equal(writes[0].payload.is_open, false);
  assert.deepEqual(filters, [["id", 7], ["season", "2026-2027"]]);
  await assert.rejects(setRegistrationOpen(mockClient({ updateResult: { data: null, error: {} } }).client, campaign, false));
});
