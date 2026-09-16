import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { normalizePublishedSeasons, normalizeSeason, shortSeason, saveClubSettings, decideRegistration } from "./clubSettings.js";
import { deleteEvent, eventPayload, eventView, formatDateForDatabase, formatDateForInput, parseEventDate, safeEventUrl, saveEvent, sortEventsNewestFirst } from "./adminEvents.js";
import { saveStaff, deleteStaff } from "./adminStaff.js";
import { readRegistrationSettings } from "./registration.js";
import { loadAdminOverview } from "./adminOverview.js";
import { withRequestTimeout } from "./requestTimeout.js";
import { publicTeamSeasons, teamMembersForSeason } from "./publicTeam.js";
import { ADMIN_PERMISSION_OPTIONS, getAdminPermissions, hasAdminPermission, isRootAdmin } from "./adminPermissions.js";
import { createAdminUser, deleteAdminUser, initialTeamPassword, teamAdminCredentials, updateAdminUser } from "./adminUsers.js";
import { assertManageableAccount, normalizePermissions, permissionIds } from "../../supabase/functions/admin-users/policy.js";
import {
  TEAM_POSTS,
  TEAM_SEASONS,
  createTeamAssignment,
  normalizeTeamRole,
} from "../constants/teamPosts.js";
import { ALBUM_PHOTOS, pickRandomAlbumPhotos } from "../data/albumPhotos.js";
import {
  completeRegistrationReview,
  interviewAnswersFromRegistration,
  saveRegistrationInterview,
  setRegistrationInteresting,
  validateInterviewAnswers,
} from "./registrationInterview.js";
import {
  applicationsTimeline,
  completedInterviewRegistrations,
  countLabels,
  eventsByYear,
  genderDistribution,
  interestingCandidateCount,
  interviewAnswerDistribution,
  registrationDecisionStats,
  teamCellForPost,
  teamStructure,
} from "./adminAnalytics.js";

const form = { title: " Robotics day ", date: "2026-06-13", image_url: "https://media.example.com/EVENTS/event.webp", link: "https://example.com/event" };

test("public team year tabs always include both requested archive seasons", () => {
  assert.deepEqual(publicTeamSeasons(null), ["2025-2026", "2024-2025"]);
  assert.deepEqual(publicTeamSeasons({ public_staff_season: "25-26" }), ["2025-2026", "2024-2025"]);
  assert.deepEqual(publicTeamSeasons({ public_staff_seasons: ["2026-2027", "24/25", "2025-2026"] }), ["2026-2027", "2025-2026", "2024-2025"]);
});

test("public team switching keeps rosters separate and never substitutes another season", () => {
  const members = [
    { id: 1, team_seasons: [{ season: "24-25" }] },
    { id: 2, team_seasons: [{ season: "2025-2026" }] },
    { id: 3, team_seasons: [{ season: "2024-2025" }, { season: "25/26" }] },
    { id: 4, season_roles: { "24/25": "President" } },
    { id: 5, years: "24-25,25-26" },
  ];
  assert.deepEqual(teamMembersForSeason(members, "2024-2025").map((m) => m.id), [1, 3, 4, 5]);
  assert.deepEqual(teamMembersForSeason(members, "2025-2026").map((m) => m.id), [2, 3, 5]);
  assert.deepEqual(teamMembersForSeason(members, "2026-2027"), []);
  assert.deepEqual(teamMembersForSeason([], "2024-2025"), []);
});

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

test("overview analytics normalize team cells and count each member once per group", () => {
  const expectedGroups = {
    PRES: "Leadership / Supervision", VP: "Leadership / Supervision", SUP: "Leadership / Supervision", "CO-SUP": "Leadership / Supervision", ADV: "Leadership / Supervision", MENTOR: "Leadership / Supervision",
    "MED-PRES": "Media", "MED-VP": "Media", SMM: "Media", "VID-EDIT": "Media",
    "DES-PRES": "Design", "DES-VP": "Design", PHOTO: "Photography", "SEC-PRES": "Secretary", "SEC-VP": "Secretary",
    "ORG-PRES": "Organization", "ORG-VP": "Organization", "EVT-COORD": "Organization",
    "COM-PRES": "Communication", "COM-VP": "Communication", FDBK: "Communication",
    "FIN-PRES": "Financial", "FIN-VP": "Financial", MEM: "Active Members",
  };
  Object.entries(expectedGroups).forEach(([post, group]) => assert.equal(teamCellForPost(post.toLowerCase()), group));
  assert.equal(teamCellForPost("ORG-UNKNOWN"), "");
  const structure = teamStructure([
    { id: 1, team_seasons: [{ season: "2026-2027", post_abbr: "MED-P" }, { season: "2026-2027", post_abbr: "SMM" }] },
    { id: 2, team_seasons: [{ season: "2026-2027", post_abbr: "PHOTO" }, { season: "2025-2026", post_abbr: "MEM" }] },
  ], "2026-2027");
  assert.deepEqual(structure, [{ label: "Media", value: 1 }, { label: "Photography", value: 1 }]);
  assert.deepEqual(genderDistribution([{ sex: "M" }, { sex: " f " }, { sex: null }]), { Male: 1, Female: 1, unknown: 1 });
});

test("team structure uses exact case-insensitive post abbreviations and exposes every cell", () => {
  const structure = teamStructure([
    { id: 3, team_seasons: [{ season: "26-27", post_abbr: "des-pres" }] },
    { id: 4, team_seasons: [{ season: "2026-2027", post_abbr: "EVT-COORD" }] },
    { id: 5, team_seasons: [{ season: "2026-2027", post_abbr: "ORG-UNKNOWN" }] },
  ], "2026-2027", { includeEmpty: true });
  assert.equal(structure.find((cell) => cell.label === "Design").value, 1);
  assert.equal(structure.find((cell) => cell.label === "Organization").value, 1);
  assert.equal(structure.find((cell) => cell.label === "Financial").value, 0);
});

test("registration analytics exclude pending decisions and normalize academic labels", () => {
  const rows = [
    { status: "accepted", department: " Computer Science " },
    { status: "accepted", department: "computer science" },
    { status: "refused", department: "Business" },
    { status: "pending", department: " " },
  ];
  const decisions = registrationDecisionStats(rows);
  assert.deepEqual({ ...decisions, acceptanceRate: Math.round(decisions.acceptanceRate) }, { accepted: 2, refused: 1, pending: 1, decided: 3, acceptanceRate: 67 });
  assert.deepEqual(countLabels(rows, "department"), [{ label: "Computer Science", value: 2 }, { label: "Business", value: 1 }]);
  assert.equal(registrationDecisionStats([{ status: "pending" }]).acceptanceRate, null);
});

test("interview analytics use completed interviews and count multi-select answers once per candidate", () => {
  const options = ["Design", "Coding / Robotics / AI", "Photography / Filming"];
  const rows = [
    { interview_completed: true, interest_type: ["Design", "Coding / Robotics / AI", "Design"], interesting: true },
    { interview_completed: true, interest_type: null, interesting: false },
    { interview_completed: false, interest_type: ["Photography / Filming"], interesting: true },
    { interview_completed: true, interest_type: ["Unknown option"], interesting: null },
  ];
  assert.equal(completedInterviewRegistrations(rows).length, 3);
  assert.deepEqual(interviewAnswerDistribution(rows, "interest_type", options, { multiple: true }), [
    { label: "Design", value: 1 },
    { label: "Coding / Robotics / AI", value: 1 },
    { label: "Photography / Filming", value: 0 },
  ]);
  assert.equal(interestingCandidateCount(rows), 2);
});

test("single-select interview analytics preserve the configured answer order", () => {
  const options = ["Leads the group", "Supports wherever needed"];
  const rows = [
    { interview_completed: true, team_role_style: "Supports wherever needed" },
    { interview_completed: true, team_role_style: "leads the group" },
    { interview_completed: false, team_role_style: "Leads the group" },
  ];
  assert.deepEqual(interviewAnswerDistribution(rows, "team_role_style", options), [
    { label: "Leads the group", value: 1 },
    { label: "Supports wherever needed", value: 1 },
  ]);
});

test("application timelines include quiet UTC days and ignore invalid timestamps", () => {
  const timeline = applicationsTimeline([
    { created_at: "2026-09-01T23:30:00-02:00" },
    { created_at: "2026-09-04T08:00:00Z" },
    { created_at: "not-a-date" },
  ]);
  assert.equal(timeline.granularity, "day");
  assert.deepEqual(timeline.values, [1, 0, 1]);
  assert.equal(timeline.peak.value, 1);
});

test("event analytics safely extract years from mixed text and ignore unusable dates", () => {
  assert.deepEqual(eventsByYear([
    { date: "20/04/2026" },
    { date: "25/02/2026 - 26/02/2026" },
    { date: "Conference 2024" },
    { date: "invalid" },
    { date: null },
  ]), [{ label: "2024", value: 1 }, { label: "2026", value: 2 }]);
});
function rpcMock(result) {
  const calls = [];
  return { calls, async rpc(name, args) { calls.push({ name, args }); return result; } };
}
const completeInterview = {
  interest_type: ["Design", "Coding / Robotics / AI"],
  team_role_style: "Gives creative ideas",
  problem_solving_style: "Discuss it with the team",
  work_environment: "Creative work",
  preferred_activity: ["Graphic Design / Content Creation"],
};
test("interview answers preload safely and require all five responses", () => {
  assert.deepEqual(interviewAnswersFromRegistration({ ...completeInterview, interest_type: ["Design", "Invalid"] }), { ...completeInterview, interest_type: ["Design"] });
  assert.deepEqual(validateInterviewAnswers(completeInterview), completeInterview);
  assert.throws(() => validateInterviewAnswers({ ...completeInterview, preferred_activity: [] }), /Which type of club activity/);
});
test("interview saving updates one registration through the protected RPC", async () => {
  const client = rpcMock({ data: { id: 18, ...completeInterview, interview_completed: true, interviewed_at: "2026-09-13T10:00:00Z" }, error: null });
  await saveRegistrationInterview(client, 18, completeInterview);
  assert.equal(client.calls[0].name, "save_registration_interview");
  assert.equal(client.calls[0].args.p_registration_id, 18);
  assert.deepEqual(client.calls[0].args.p_interest_type, completeInterview.interest_type);
});
test("completed review saves interview and decision through one atomic RPC", async () => {
  const client = rpcMock({ data: { id: 18, ...completeInterview, interview_completed: true, status: "refused", refusal_reason: "Limited places" }, error: null });
  await completeRegistrationReview(client, 18, completeInterview, "refused", "  Limited places  ");
  assert.equal(client.calls.length, 1);
  assert.deepEqual({
    name: client.calls[0].name,
    decision: client.calls[0].args.p_decision,
    reason: client.calls[0].args.p_reason,
  }, { name: "complete_registration_review", decision: "refused", reason: "Limited places" });
  await assert.rejects(completeRegistrationReview(client, 18, completeInterview, "refused", " "), /refusal reason/);
  assert.equal(client.calls.length, 1);
});
test("Interesting candidate flag uses its independent permission-checked RPC", async () => {
  const client = rpcMock({ data: { id: 18, interesting: true }, error: null });
  assert.deepEqual(await setRegistrationInteresting(client, 18, true), { id: 18, interesting: true });
  assert.deepEqual(client.calls, [{ name: "set_registration_interesting", args: { p_registration_id: 18, p_interesting: true } }]);
  await assert.rejects(setRegistrationInteresting(rpcMock({ data: { id: 18, interesting: true }, error: null }), 18, false), /not confirmed/);
});
test("Interesting candidate migration keeps the public flag false and restricts the toggle", () => {
  const migration = readFileSync(new URL("../../supabase/migration_registration_interesting.sql", import.meta.url), "utf8");
  assert.match(migration, /interesting IS FALSE/);
  assert.match(migration, /public\.has_club_permission\('registrations'\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.set_registration_interesting/);
  assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
  assert.doesNotMatch(migration, /GRANT UPDATE\s*\(interesting\)/);
});
test("interview migration blocks public answers and preserves the first interview timestamp", () => {
  const migration = readFileSync(new URL("../../supabase/migration_registration_interviews.sql", import.meta.url), "utf8");
  assert.match(migration, /interest_type IS NULL[\s\S]*interview_completed IS FALSE[\s\S]*interviewed_at IS NULL/);
  assert.match(migration, /public\.has_club_permission\('registrations'\)/);
  assert.match(migration, /interviewed_at = coalesce\(registration\.interviewed_at, now\(\)\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_registration_review/);
  assert.match(migration, /PERFORM public\.save_registration_interview[\s\S]*SET status = p_decision/);
  assert.doesNotMatch(migration, /GRANT UPDATE\s*\(/);
});
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
test("settings use one atomic RPC with one or many published team seasons", async () => {
  const data = {
    current_season: "2026-2027",
    public_staff_season: "2025-2026",
    public_staff_seasons: ["2025-2026", "2026-2027"],
  };
  const client = rpcMock({ data, error: null });
  assert.deepEqual(await saveClubSettings(client, data), data);
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0], {
    name: "save_club_settings_seasons",
    args: {
      p_current_season: "2026-2027",
      p_public_staff_seasons: ["2025-2026", "2026-2027"],
    },
  });
  assert.deepEqual(normalizePublishedSeasons({ public_staff_season: "2024-2025" }), ["2024-2025"]);
  await assert.rejects(saveClubSettings(client, { ...data, current_season: "bad" }));
});
test("multiple public team seasons migration preserves the legacy primary season", () => {
  const migration = readFileSync(new URL("../../supabase/migration_multiple_public_team_seasons.sql", import.meta.url), "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS public_staff_seasons text\[\]/);
  assert.match(migration, /SET public_staff_seasons = ARRAY\[public_staff_season\]/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.save_club_settings_seasons/);
  assert.match(migration, /public_staff_season = normalized_seasons\[1\]/);
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

test("root and Social Media permissions match between the UI and account service", () => {
  const root = { id: "root", app_metadata: { club_admin: true, club_role: "owner", club_permissions: ["overview"] } };
  assert.equal(isRootAdmin(root), true);
  assert.deepEqual(getAdminPermissions(root), permissionIds);
  assert.deepEqual(ADMIN_PERMISSION_OPTIONS.map((option) => option.id), permissionIds);
  assert.equal(hasAdminPermission(root, "users"), true);
  assert.equal(hasAdminPermission(root, "social_media"), true);
  const social = { app_metadata: { club_admin: true, club_permissions: ["social_media"] } };
  assert.equal(isRootAdmin(social), false);
  assert.equal(hasAdminPermission(social, "social_media"), true);
  assert.equal(hasAdminPermission(social, "events"), false);
  assert.deepEqual(normalizePermissions(["social_media", "social_media", "owner", null]), ["overview", "social_media"]);
});

test("Team initial passwords use the stored name order and supplied current year", () => {
  assert.equal(initialTeamPassword(" KACHBAL Ilham ", 2026), "kachbal@ilham//2026");
  assert.equal(initialTeamPassword("Émile El Amrani", 2027), "emile@el-amrani//2027");
  assert.equal(initialTeamPassword("Kachbal Ilham"), `kachbal@ilham//${new Date().getFullYear()}`);
  assert.throws(() => initialTeamPassword("Ilham", 2026), /first name and last name/);
  assert.throws(() => initialTeamPassword("", 2026), /first name and last name/);
});

test("admin login email and password are both generated from the Team profile", () => {
  assert.deepEqual(teamAdminCredentials(" KACHBAL Ilham ", 2026), {
    email: "kachbal.ilham@gmail.com", password: "kachbal@ilham//2026",
  });
  assert.deepEqual(teamAdminCredentials("Émile El Amrani", 2027), {
    email: "emile.elamrani@gmail.com", password: "emile@el-amrani//2027",
  });
  assert.deepEqual(teamAdminCredentials("Kachbal Ilham"), {
    email: "kachbal.ilham@gmail.com", password: `kachbal@ilham//${new Date().getFullYear()}`,
  });
  assert.throws(() => teamAdminCredentials("Ilham"), /first name and last name/);
  assert.throws(() => teamAdminCredentials("عمر علي"), /Latin-letter/);
  assert.throws(() => teamAdminCredentials(`${"a".repeat(40)} ${"b".repeat(40)}`), /too long.*email/);
});

test("events without an external link retain an accessible View preview action", () => {
  const source = readFileSync(new URL("../components/Admin/AdminEvents.jsx", import.meta.url), "utf8");
  assert.match(source, /linkUrl \? <a/);
  assert.match(source, /onClick=\{\(\) => onView\(record\)\}/);
  assert.match(source, /onView=\{setViewing\}/);
  assert.match(source, /className="admin-event-dialog admin-event-view-dialog"/);
  assert.match(source, /aria-labelledby="event-view-title"/);
});

test("only root can manage officers and current or root accounts remain protected", () => {
  const root = { id: "root", app_metadata: { club_admin: true, club_role: "owner", club_permissions: [] } };
  const officer = { id: "officer", app_metadata: { club_admin: true, club_permissions: ["users"] } };
  assert.doesNotThrow(() => assertManageableAccount(root, officer));
  assert.throws(() => assertManageableAccount(officer, root), /Only the root/);
  assert.throws(() => assertManageableAccount(root, root), /own admin account/);
  assert.throws(() => assertManageableAccount(root, { ...root, id: "another-root" }), /protected/);
  assert.throws(() => assertManageableAccount(root, { id: "legacy", app_metadata: { club_admin: true } }), /protected/);
  assert.throws(() => assertManageableAccount(root, { id: "student", app_metadata: {} }), /not found/);
});

test("admin deletion requires the server to confirm the exact deleted account", async () => {
  const calls = [];
  const client = { functions: { async invoke(name, options) {
    calls.push({ name, body: options.body });
    return { data: { ok: true, deletedUserId: options.body.userId }, error: null };
  } } };
  assert.equal(await deleteAdminUser(client, "officer-id"), "officer-id");
  assert.deepEqual(calls, [{ name: "admin-users", body: { action: "delete", userId: "officer-id" } }]);
  const unconfirmed = { functions: { async invoke() { return { data: { ok: true, deletedUserId: "different-id" }, error: null }; } } };
  await assert.rejects(deleteAdminUser(unconfirmed, "officer-id"), /not confirmed/);
});
test("admin user calls go through the protected Edge Function", async () => {
  const calls = [];
  const client = { functions: { async invoke(name, options) {
    calls.push({ name, body: options.body });
    return { data: { ok: true, user: { id: "admin-id" } }, error: null };
  } } };
  await createAdminUser(client, { teamId: "team-profile-id", permissions: ["events", "social_media"] });
  await updateAdminUser(client, "admin-id", { permissions: ["team"] });
  assert.deepEqual(calls.map((call) => call.name), ["admin-users", "admin-users"]);
  assert.deepEqual(calls.map((call) => call.body.action), ["create", "update"]);
  assert.deepEqual(calls[0].body, { action: "create", teamId: "team-profile-id", permissions: ["events", "social_media"] });
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
  assert.match(edgeFunction, /adminClient\.auth\.admin\.deleteUser\(userId\)/);
  assert.match(edgeFunction, /assertManageableAccount\(caller, target\)/);
  assert.match(edgeFunction, /\.select\("id,full_name"\)\.eq\("id", teamId\)/);
  assert.match(edgeFunction, /teamAdminCredentials\(profile\.full_name\)/);
  const creationSource = edgeFunction.slice(edgeFunction.indexOf('if (body.action === "create")'), edgeFunction.indexOf('if (body.action === "update"'));
  assert.doesNotMatch(creationSource, /body\.(email|password|displayName)/);
  assert.doesNotMatch(edgeFunction, /body\.(?:password|displayName).*\n.*const permissions/);
  assert.ok(edgeFunction.indexOf("body = await request.json()") < edgeFunction.indexOf('["create", "update", "delete"]'));
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
  assert.equal(parseEventDate("25/02/2026 - 26/02/2026")?.toISOString(), "2026-02-25T00:00:00.000Z");
  assert.equal(parseEventDate("03/2026")?.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.throws(() => formatDateForDatabase("2026-02-30"), /valid/);
});
test("event chronology puts newest valid event dates first", () => {
  const events = [
    { id: "invalid", date: "To be announced", created_at: "2027-01-01T00:00:00Z" },
    { id: "range", date: "25/02/2026 - 26/02/2026", created_at: null },
    { id: "month", date: "03/2026", created_at: null },
    { id: "old", date: "13-14 Oct 2024", created_at: null },
  ];
  assert.deepEqual(sortEventsNewestFirst(events).map(({ id }) => id), ["month", "range", "old", "invalid"]);
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
