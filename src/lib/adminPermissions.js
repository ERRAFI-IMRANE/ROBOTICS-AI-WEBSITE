export const ADMIN_PERMISSION_OPTIONS = [
  { id: "overview", label: "Overview", description: "View dashboard metrics and activity." },
  { id: "team", label: "Team", description: "Add, edit, and remove team profiles." },
  { id: "events", label: "Events", description: "Create, edit, and remove club events." },
  { id: "registrations", label: "Registrations", description: "Review applicants and control intake." },
  { id: "users", label: "Admin users", description: "Create admins and change their permissions." },
];

const VALID_PERMISSIONS = new Set(ADMIN_PERMISSION_OPTIONS.map((item) => item.id));

export function getAdminPermissions(user) {
  if (user?.app_metadata?.club_admin !== true) return [];
  const stored = user.app_metadata.club_permissions;
  if (!Array.isArray(stored)) return ADMIN_PERMISSION_OPTIONS.map((item) => item.id);
  return [...new Set(["overview", ...stored.filter((permission) => VALID_PERMISSIONS.has(permission))])];
}

export function hasAdminPermission(user, permission) {
  return getAdminPermissions(user).includes(permission);
}

export function isLegacyFullAccess(user) {
  return user?.app_metadata?.club_admin === true && !Array.isArray(user.app_metadata.club_permissions);
}
