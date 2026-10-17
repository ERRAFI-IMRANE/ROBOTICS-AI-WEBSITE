import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminUser, listAdminUsers, updateAdminUser } from "./adminUsers.js";
import { getAdminPermissions, hasAdminPermission } from "./adminPermissions.js";
import { assertSavedPermissions, normalizePermissions, permissionIds, validatePermissions } from "../../supabase/functions/admin-users/policy.js";

test("Club wear survives server validation, stored metadata and UI permissions", () => {
  const requested = validatePermissions(["club_wear", "absence", "club_wear"]);
  assert.deepEqual(requested, ["overview", "club_wear", "absence"]);
  const user = { app_metadata: { club_admin: true, club_permissions: requested } };
  assertSavedPermissions(user, requested);
  assert.equal(hasAdminPermission(user, "club_wear"), true);
  assert.deepEqual(getAdminPermissions(user), requested);
  assert.throws(() => validatePermissions(["club_wear", "unknown"]), /Unsupported/);
  assert.throws(() => assertSavedPermissions({ app_metadata: { club_permissions: ["overview", "absence"] } }, requested), /every requested permission/);
});

test("create, edit and list retain the HR officer's Club wear permission", async () => {
  let saved;
  const calls = [];
  const client = { functions: { async invoke(name, { body }) {
    assert.equal(name, "admin-users");
    calls.push(body.action);
    if (body.action === "capabilities") return { data: { ok: true, supportedPermissions: permissionIds } };
    if (body.action === "list") return { data: { ok: true, users: [saved] } };
    saved = { id: "hr-user", permissions: normalizePermissions(body.permissions) };
    return { data: { ok: true, user: saved } };
  } } };
  await createAdminUser(client, { teamId: "hr-profile", permissions: ["club_wear"] });
  await updateAdminUser(client, "hr-user", { permissions: ["club_wear", "absence"] });
  assert.deepEqual((await listAdminUsers(client))[0].permissions, ["overview", "club_wear", "absence"]);
  assert.deepEqual(calls, ["capabilities", "create", "capabilities", "update", "list"]);
});

test("a stale deployed function cannot silently strip Club wear before saving", async () => {
  for (const oldResponse of [
    { data: { ok: false, error: "Unsupported admin user action." } },
    { data: { ok: true, supportedPermissions: permissionIds.filter((id) => id !== "club_wear") } },
  ]) {
    const actions = [];
    const client = { functions: { async invoke(name, { body }) { actions.push(body.action); return oldResponse; } } };
    await assert.rejects(updateAdminUser(client, "hr-user", { permissions: ["club_wear"] }), /Redeploy admin-users/);
    assert.deepEqual(actions, ["capabilities"]);
  }
});

test("saving cannot claim success if the server returns missing permissions", async () => {
  const client = { functions: { async invoke(name, { body }) {
    return { data: body.action === "capabilities"
      ? { ok: true, supportedPermissions: permissionIds }
      : { ok: true, user: { id: "hr-user", permissions: ["overview"] } } };
  } } };
  await assert.rejects(updateAdminUser(client, "hr-user", { permissions: ["club_wear"] }), /did not preserve/);
});
