export const permissionIds = ["overview", "team", "events", "registrations", "social_media", "users"];

export function isRootAdmin(user) {
  const metadata = user?.app_metadata;
  return metadata?.club_admin === true && (
    metadata.club_role === "owner" || !Array.isArray(metadata.club_permissions)
  );
}

export function normalizePermissions(input) {
  const valid = new Set(permissionIds);
  return [...new Set(["overview", ...(Array.isArray(input)
    ? input.filter((item) => typeof item === "string" && valid.has(item)) : [])])];
}

export function initialTeamPassword(fullName, year = new Date().getFullYear()) {
  const names = String(fullName || "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter(Boolean);
  if (names.length < 2) throw new Error("The Team profile must have a first name and last name.");
  const clean = (value) => value.replace(/[^\p{L}\p{N}-]/gu, "");
  const first = clean(names[0]);
  const last = names.slice(1).map(clean).filter(Boolean).join("-");
  if (!first || !last) throw new Error("The Team profile must have a first name and last name.");
  const password = `${first}@${last}//${year}`;
  if (password.length > 200) throw new Error("The Team profile name is too long for an initial password.");
  return password;
}

export function teamAdminCredentials(fullName, year = new Date().getFullYear()) {
  const password = initialTeamPassword(fullName, year);
  const name = password.slice(0, password.lastIndexOf("//"));
  const [firstName, lastName] = name.split("@");
  const gmailPart = (value) => value.replace(/[^a-z0-9]/g, "");
  const first = gmailPart(firstName);
  const last = gmailPart(lastName);
  if (!first || !last) throw new Error("The Team profile needs a Latin-letter first and last name to generate the Gmail login.");
  const localPart = `${first}.${last}`;
  if (localPart.length > 64) throw new Error("The Team profile name is too long for a generated email address.");
  return { email: `${localPart}@gmail.com`, password };
}

export function assertManageableAccount(caller, target) {
  if (!isRootAdmin(caller)) throw new Error("Only the root administrator can manage admin accounts.");
  if (!target || target.app_metadata?.club_admin !== true) throw new Error("Admin account not found.");
  if (target.id === caller.id) throw new Error("You cannot change or delete your own admin account.");
  if (isRootAdmin(target)) throw new Error("Root administrator accounts are protected.");
}
