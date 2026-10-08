import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TEAM_POSTS,
  availableTeamSeasons,
  createTeamAssignment,
  getTeamMemberPostOrder,
  getTeamPost,
  getTeamPostOrder,
  normalizeTeamRole,
} from "../constants/teamPosts.js";
import { saveStaff } from "./adminStaff.js";
import { teamStructure } from "./adminAnalytics.js";

test("HR posts are unique and sit between the entire Media cell and Design", () => {
  assert.equal(TEAM_POSTS.length, 26);
  assert.equal(new Set(TEAM_POSTS.map((post) => post.role)).size, 26);
  assert.equal(new Set(TEAM_POSTS.map((post) => post.post_abbr)).size, 26);
  assert.deepEqual(TEAM_POSTS.map((post) => post.post_order), Array.from({ length: 26 }, (_, index) => index + 1));
  assert.deepEqual(TEAM_POSTS.slice(6, 14).map((post) => post.post_abbr), [
    "MED-PRES", "MED-VP", "SMM", "VID-EDIT", "HR-PRES", "HR-VP", "DES-PRES", "DES-VP",
  ]);
  assert.equal(normalizeTeamRole("hr-pres"), "President of the Human Resources Cell");
  assert.equal(getTeamPost("HR-VP").role, "Vice President of the Human Resources Cell");
});

test("shared ordering handles pre-HR saved orders without mutating the roster", () => {
  const season = "2026-2027";
  const roster = TEAM_POSTS.map((post, id) => ({
    id,
    team_seasons: [{ season, ...post, post_order: post.post_order > 12 ? post.post_order - 2 : post.post_order }],
  })).reverse();
  const snapshot = structuredClone(roster);
  const sorted = [...roster].sort((a, b) => getTeamMemberPostOrder(a, season) - getTeamMemberPostOrder(b, season));
  assert.deepEqual(sorted.map((member) => member.team_seasons[0].post_abbr), TEAM_POSTS.map((post) => post.post_abbr));
  assert.deepEqual(roster, snapshot);
});

test("ordering selects the correct season and supports abbreviation-only and legacy records", () => {
  const member = { team_seasons: [
    { season: "2025-2026", role: "Club President", post_order: 4 },
    { season: "2026-2027", role: "Vice President of the Human Resources Cell", post_order: 99 },
  ] };
  assert.equal(getTeamMemberPostOrder(member, "26-27"), 12);
  assert.equal(getTeamMemberPostOrder(member, "2025-2026"), 4);
  assert.equal(getTeamMemberPostOrder({ team_seasons: [{ season: "26/27", post_abbr: "hr-pres" }] }, "2026-2027"), 11);
  assert.equal(getTeamMemberPostOrder({ season_roles: { "26-27": "HR-VP" }, post_order: 99 }, "2026-2027"), 12);
  assert.equal(getTeamMemberPostOrder({ role: "Unknown legacy post", post_order: { "26-27": 42 } }, "2026-2027"), 42);
  assert.equal(getTeamPostOrder({ role: "Unknown", post_order: null }), Infinity);
  assert.equal(getTeamPostOrder({ role: "Unknown", post_order: "" }), Infinity);
  assert.equal(getTeamPostOrder({ role: "Unknown", post_order: 0 }), 0);
});

test("current and future seasons can assign either HR post with canonical database metadata", () => {
  for (const season of ["2026-2027", "2027-2028", "2030-2031"]) {
    for (const abbreviation of ["HR-PRES", "HR-VP"]) {
      const post = getTeamPost(abbreviation);
      assert.deepEqual(createTeamAssignment(season, post.role), { season, ...post });
    }
  }
  assert.throws(() => createTeamAssignment("2026-2028", "HR-PRES"), /YYYY-YYYY/);
  assert.throws(() => createTeamAssignment("", "HR-PRES"), /YYYY-YYYY/);
  assert.throws(() => createTeamAssignment("26-27", "HR-PRES"), /YYYY-YYYY/);
  const seasons = availableTeamSeasons(["2030-2031", "bad"], "2027-2028");
  assert.ok(seasons.includes("2027-2028"));
  assert.ok(seasons.includes("2028-2029"));
  assert.ok(seasons.includes("2030-2031"));
  assert.ok(!seasons.includes("bad"));
});

test("new and edited HR assignments use the existing staff RPC without duplicate profiles", async () => {
  for (const id of [null, 42]) {
    const calls = [];
    const client = { async rpc(name, args) {
      calls.push({ name, args });
      return { data: { id: id || 42, season_count: 2 }, error: null };
    } };
    const profile = { full_name: "Existing Team Profile", sex: "F", avatar_img: "/existing.png" };
    await saveStaff(client, id, profile, [
      { season: "2026-2027", role: "HR-PRES", post_abbr: "wrong", post_order: 99 },
      { season: "2027-2028", role: "HR-VP" },
    ]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "save_club_staff");
    assert.equal(calls[0].args.p_team_id, id);
    assert.deepEqual(calls[0].args.p_profile, profile);
    assert.deepEqual(calls[0].args.p_seasons, [
      { season: "2026-2027", ...getTeamPost("HR-PRES") },
      { season: "2027-2028", ...getTeamPost("HR-VP") },
    ]);
  }
});

test("HR analytics respect the selected season and show the cell between Media and Design", () => {
  const structure = teamStructure([
    { id: 1, team_seasons: [{ season: "2026-2027", post_abbr: "hr-pres" }] },
    { id: 2, team_seasons: [{ season: "2026-2027", post_abbr: "HR-VP" }] },
    { id: 3, team_seasons: [{ season: "2027-2028", post_abbr: "HR-PRES" }] },
  ], "2026-2027", { includeEmpty: true });
  const index = structure.findIndex((cell) => cell.label === "Human Resources");
  assert.equal(structure[index].value, 2);
  assert.equal(structure[index - 1].label, "Media");
  assert.equal(structure[index + 1].label, "Design");
});

test("admin selector and both roster views use the shared post configuration and ordering", () => {
  const admin = readFileSync(new URL("../components/Admin/AdminTeam.jsx", import.meta.url), "utf8");
  const publicTeam = readFileSync(new URL("../components/TeamSection/TeamSection.jsx", import.meta.url), "utf8");
  assert.match(admin, /TEAM_POSTS\.map\(\(post\) =>/);
  assert.match(admin, /const getMemberPostOrder = getTeamMemberPostOrder/);
  assert.match(publicTeam, /const getMemberPostOrder = getTeamMemberPostOrder/);
  assert.doesNotMatch(admin, /TEAM_SEASONS\.includes\(season\)/);
});
