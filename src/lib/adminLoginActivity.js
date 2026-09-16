export function adminLoginActivity(users) {
  return users.map((user) => {
    const timestamp = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN;
    return { user, lastLogin: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null };
  }).sort((a, b) => {
    if (!a.lastLogin && !b.lastLogin) return String(a.user.display_name || a.user.email || "").localeCompare(String(b.user.display_name || b.user.email || ""));
    if (!a.lastLogin) return 1;
    if (!b.lastLogin) return -1;
    return Date.parse(b.lastLogin) - Date.parse(a.lastLogin);
  });
}
