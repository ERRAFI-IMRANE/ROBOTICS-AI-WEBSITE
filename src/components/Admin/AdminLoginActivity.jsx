import { useMemo } from "react";
import { adminLoginActivity } from "../../lib/adminLoginActivity";
import "./AdminLoginActivity.css";

export function LastLoginTime({ value }) {
  const timestamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp)) return <span className="admin-login-never">Never signed in</span>;
  const date = new Date(timestamp);
  return <time className="admin-login-time" dateTime={date.toISOString()} title={date.toLocaleString()}>
    <strong>{date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</strong>
    <small>{date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}</small>
  </time>;
}

export default function AdminLoginActivity({ users, loading, error }) {
  const activity = useMemo(() => adminLoginActivity(users), [users]);
  return <section className="admin-panel admin-login-panel" aria-labelledby="admin-login-activity-title" aria-busy={loading}>
    <div className="admin-login-heading"><div><h2 id="admin-login-activity-title">Last login</h2><p>Latest sign-in for each administrator, most recent first. Times are shown in your local timezone.</p></div></div>
    {loading ? <p className="admin-login-empty" role="status">Loading sign-in activity…</p>
      : error ? <p className="admin-login-empty">Sign-in activity could not be refreshed. Use Refresh users to try again.</p>
      : !activity.length ? <p className="admin-login-empty">No admin accounts match this search.</p>
      : <ul className="admin-login-list">{activity.map(({ user, lastLogin }) => <li key={user.id}>
        <span className={`admin-login-indicator ${lastLogin ? "has-login" : ""}`} aria-hidden="true" />
        <span className="admin-login-identity"><strong>{user.display_name || "Unnamed administrator"}</strong><small>{user.email}</small></span>
        <LastLoginTime value={lastLogin} />
      </li>)}</ul>}
    <p className="admin-login-caption">This is the latest recorded sign-in, not a full login history or online status. Refresh users to update it.</p>
  </section>;
}
