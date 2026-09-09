import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ADMIN_PERMISSION_OPTIONS } from "../../lib/adminPermissions";
import { createAdminUser, listAdminUsers, updateAdminUser } from "../../lib/adminUsers";
import { supabase } from "../../lib/supabaseClient";

const DEFAULT_PERMISSIONS = ["overview", "team", "events", "registrations"];

function formatDate(value, fallback = "Never") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function PermissionList({ permissions }) {
  return (
    <div className="admin-user-permission-list">
      {permissions.map((permission) => (
        <span key={permission}>{ADMIN_PERMISSION_OPTIONS.find((item) => item.id === permission)?.label || permission}</span>
      ))}
    </div>
  );
}

export default function AdminUsers({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUsers(await listAdminUsers(supabase));
    } catch (loadError) {
      setError(loadError.message || "Admin accounts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => `${user.display_name} ${user.email}`.toLowerCase().includes(needle));
  }, [query, users]);

  const openCreate = () => {
    setEditor({ mode: "create" });
    setDisplayName("");
    setEmail("");
    setPassword("");
    setPermissions(DEFAULT_PERMISSIONS);
    setError("");
  };

  const openEdit = (user) => {
    setEditor({ mode: "edit", user });
    setDisplayName(user.display_name || "");
    setEmail(user.email || "");
    setPassword("");
    setPermissions(user.permissions || ["overview"]);
    setError("");
  };

  const togglePermission = (permission) => {
    if (permission === "overview") return;
    setPermissions((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  };

  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (editor.mode === "create") {
        await createAdminUser(supabase, { displayName, email, password, permissions });
        setNotice("Admin account created. The officer can sign in with the temporary password.");
      } else {
        await updateAdminUser(supabase, editor.user.id, { displayName, permissions });
        setNotice("Admin permissions updated.");
      }
      setEditor(null);
      setPassword("");
      await load();
    } catch (saveError) {
      setError(saveError.message || "The admin account could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-tab-content admin-users-page">
      <div className="admin-view-header">
        <div>
          <h1 className="admin-page-title">Admin users</h1>
          <p className="admin-page-desc">Control who can enter the officer workspace and what each account can manage.</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="btn-secondary" onClick={load} disabled={loading || busy}>Refresh users</button>
          <button type="button" className="btn-primary" onClick={openCreate} disabled={loading || busy}>Add admin user</button>
        </div>
      </div>

      {notice && <div className="admin-inline-success" role="status">{notice}</div>}
      {error && !editor && <div className="admin-inline-error" role="alert">{error}</div>}

      <div className="member-filters-bar admin-users-toolbar">
        <div>
          <strong>{users.length} admin {users.length === 1 ? "account" : "accounts"}</strong>
          <span>Permissions take effect on the user’s next refreshed session.</span>
        </div>
        <input
          className="form-text-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or email"
          aria-label="Search admin users"
        />
      </div>

      <div className="admin-panel admin-users-table-wrap">
        <table className="admin-users-table">
          <thead><tr><th>Administrator</th><th>Permissions</th><th>Created</th><th>Last sign in</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading && [1, 2, 3].map((item) => (
              <tr key={item} className="is-loading"><td colSpan="5"><span className="skeleton-shimmer skeleton-line" /></td></tr>
            ))}
            {!loading && visibleUsers.map((user) => {
              const isCurrent = user.id === currentUser?.id;
              return (
                <tr key={user.id}>
                  <td data-label="Administrator">
                    <div className="admin-user-identity">
                      <span className="admin-user-avatar">{(user.display_name || user.email || "A").slice(0, 1).toUpperCase()}</span>
                      <span><strong>{user.display_name || "Unnamed administrator"}</strong><small>{user.email}</small></span>
                      {isCurrent && <em>You</em>}
                    </div>
                  </td>
                  <td data-label="Permissions">
                    <PermissionList permissions={user.permissions || []} />
                    {user.legacy_full_access && <small className="admin-user-legacy-note">Legacy full access</small>}
                  </td>
                  <td data-label="Created">{formatDate(user.created_at, "Unknown")}</td>
                  <td data-label="Last sign in">{formatDate(user.last_sign_in_at)}</td>
                  <td className="admin-users-action-cell">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => openEdit(user)}
                      disabled={isCurrent || busy}
                      title={isCurrent ? "Sign in with another user manager to change this account." : "Edit permissions"}
                    >
                      {isCurrent ? "Current account" : "Edit permissions"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && !visibleUsers.length && (
          <div className="admin-empty-state">{query ? "No admin accounts match this search." : "No admin accounts were returned."}</div>
        )}
      </div>

      {editor && (
        <div className="admin-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditor(null); }}>
          <form className="admin-modal-dialog admin-user-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-user-editor-title" onSubmit={save}>
            <div className="admin-modal-header">
              <div><h2 id="admin-user-editor-title" className="admin-modal-title">{editor.mode === "create" ? "Add admin user" : "Edit admin permissions"}</h2><p>{editor.mode === "create" ? "Create a secure officer account." : editor.user.email}</p></div>
              <button type="button" className="admin-modal-close-btn" aria-label="Close" disabled={busy} onClick={() => setEditor(null)}>×</button>
            </div>
            <div className="admin-modal-body">
              {error && <div className="admin-inline-error" role="alert">{error}</div>}
              <div className="admin-user-editor-fields">
                <label className="form-field-group"><span className="form-field-label">Display name</span><input className="form-text-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength="120" placeholder="Officer name" /></label>
                <label className="form-field-group"><span className="form-field-label">Email address</span><input className="form-text-input" type="email" required readOnly={editor.mode === "edit"} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" /></label>
                {editor.mode === "create" && <label className="form-field-group"><span className="form-field-label">Temporary password</span><input className="form-text-input" type="password" required minLength="8" maxLength="200" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><small>At least 8 characters. Share it privately with the new administrator.</small></label>}
              </div>

              <fieldset className="admin-permission-fieldset">
                <legend>Workspace permissions</legend>
                <p>Select only the areas this administrator needs.</p>
                <div className="admin-permission-grid">
                  {ADMIN_PERMISSION_OPTIONS.map((permission) => {
                    const checked = permissions.includes(permission.id);
                    const required = permission.id === "overview";
                    return (
                      <label key={permission.id} className={`admin-permission-option ${checked ? "is-selected" : ""}`}>
                        <input type="checkbox" checked={checked} disabled={required || busy} onChange={() => togglePermission(permission.id)} />
                        <span><strong>{permission.label}</strong><small>{permission.description}</small></span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setEditor(null)} disabled={busy}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : editor.mode === "create" ? "Create admin" : "Save permissions"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
