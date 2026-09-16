import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ADMIN_PERMISSION_OPTIONS, isRootAdmin } from "../../lib/adminPermissions";
import { createAdminUser, deleteAdminUser, initialTeamPassword, listAdminUsers, updateAdminUser } from "../../lib/adminUsers";
import { supabase } from "../../lib/supabaseClient";
import { AdminConfirmDialog, AdminToast } from "./AdminActionFeedback";
import { useAdminToast } from "./useAdminToast";

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

export default function AdminUsers({ currentUser, teamProfiles = [] }) {
  const canManage = isRootAdmin(currentUser);
  const actionLock = useRef(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [teamId, setTeamId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const { toast, showToast, clearToast } = useAdminToast();
  const sortedProfiles = useMemo(() => [...teamProfiles].sort((a, b) =>
    String(a.full_name || a.name || "").localeCompare(String(b.full_name || b.name || ""))), [teamProfiles]);
  const selectedProfile = teamProfiles.find((profile) => String(profile.id) === teamId);
  const passwordPreview = useMemo(() => {
    if (!selectedProfile) return { value: "", error: "" };
    try {
      return { value: initialTeamPassword(selectedProfile.full_name || selectedProfile.name), error: "" };
    } catch (error) {
      return { value: "", error: error.message };
    }
  }, [selectedProfile]);

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
    if (!canManage) return;
    setEditor({ mode: "create" });
    setDisplayName("");
    setEmail("");
    setTeamId("");
    setShowPassword(false);
    setPermissions(DEFAULT_PERMISSIONS);
    setError("");
  };

  const openEdit = (user) => {
    if (!canManage || user.id === currentUser?.id || user.is_root || user.role === "owner" || user.legacy_full_access) return;
    setEditor({ mode: "edit", user });
    setDisplayName(user.display_name || "");
    setEmail(user.email || "");
    setPermissions(user.permissions || ["overview"]);
    setError("");
  };

  const togglePermission = (permission) => {
    if (permission === "overview") return;
    setPermissions((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  };

  const performSave = async () => {
    if (actionLock.current || !canManage) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      if (editor.mode === "create") {
        await createAdminUser(supabase, { teamId, email, permissions });
        showToast("Admin account created. The officer can now sign in with the temporary password.");
      } else {
        await updateAdminUser(supabase, editor.user.id, { displayName, permissions });
        showToast("Admin permissions updated successfully.");
      }
      setEditor(null);
      setTeamId("");
      setShowPassword(false);
      await load();
    } catch (saveError) {
      const message = saveError.message || "The admin account could not be saved.";
      setError(message);
      showToast(message, "error");
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const save = (event) => {
    event.preventDefault();
    if (busy || confirmation || !editor || !canManage) return;
    const isCreate = editor.mode === "create";
    if (isCreate && (!selectedProfile || passwordPreview.error)) {
      setError(passwordPreview.error || "Choose a Team profile.");
      return;
    }
    setConfirmation({
      title: isCreate ? "Create this admin account?" : "Save permission changes?",
      message: isCreate
        ? `${displayName.trim() || email.trim()} will receive access to ${permissions.length} dashboard area${permissions.length === 1 ? "" : "s"}.`
        : `Update dashboard access for ${editor.user.display_name || editor.user.email}?`,
      confirmLabel: isCreate ? "Create admin" : "Save permissions",
      action: performSave,
    });
  };

  const requestDelete = (user) => {
    if (!canManage || busy || confirmation || user.id === currentUser?.id || user.is_root || user.role === "owner" || user.legacy_full_access) return;
    setConfirmation({
      title: "Delete this admin account?",
      message: `Permanently delete the login account for ${user.display_name || user.email}? This cannot be undone. Their Team profile will not be deleted by this action.`,
      confirmLabel: "Delete admin account",
      tone: "danger",
      action: async () => {
        if (actionLock.current) return;
        actionLock.current = true;
        setBusy(true);
        setError("");
        try {
          await deleteAdminUser(supabase, user.id);
          showToast("Admin account deleted successfully.");
          await load();
        } catch (error) {
          setError(error.message || "The admin account could not be deleted.");
          showToast(error.message || "The admin account could not be deleted.", "error");
        } finally {
          actionLock.current = false;
          setBusy(false);
        }
      },
    });
  };

  const runConfirmedAction = async () => {
    const action = confirmation?.action;
    if (!action) return;
    setConfirmation(null);
    await action();
  };

  return (
    <div className="admin-tab-content admin-users-page">
      <AdminToast toast={toast} onClose={clearToast} />

      <div className="admin-view-header">
        <div>
          <h1 className="admin-page-title">Admin users</h1>
          <p className="admin-page-desc">Control who can enter the officer workspace and what each account can manage.</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="btn-secondary" onClick={load} disabled={loading || busy}>Refresh users</button>
          {canManage && <button type="button" className="btn-primary" onClick={openCreate} disabled={loading || busy}>Add admin user</button>}
        </div>
      </div>

      {error && !editor && <div className="admin-inline-error" role="alert">{error}</div>}
      {!canManage && <p className="admin-page-desc">You can view accounts. Only the root administrator can create users, edit permissions, or delete accounts.</p>}

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
              const isProtected = isCurrent || user.is_root || user.role === "owner" || user.legacy_full_access;
              return (
                <tr key={user.id}>
                  <td data-label="Administrator">
                    <div className="admin-user-identity">
                      <span className="admin-user-avatar">{(user.display_name || user.email || "A").slice(0, 1).toUpperCase()}</span>
                      <span><strong>{user.display_name || "Unnamed administrator"}</strong><small>{user.email}</small></span>
                      {isCurrent && <em>You</em>}
                      {(user.is_root || user.role === "owner" || user.legacy_full_access) && <em>Root admin</em>}
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
                      disabled={isProtected || busy || !canManage}
                      title={isProtected ? "Root and current accounts are protected." : "Edit permissions"}
                    >
                      {isCurrent ? "Current account" : isProtected ? "Protected account" : "Edit permissions"}
                    </button>
                    {canManage && !isProtected && <button type="button" className="btn-secondary btn-danger" onClick={() => requestDelete(user)} disabled={busy}>Delete</button>}
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
                {editor.mode === "create" ? (
                  <label className="form-field-group"><span className="form-field-label">Team profile</span>
                    <select className="form-text-input" required value={teamId} disabled={busy} onChange={(event) => {
                      const id = event.target.value;
                      const profile = teamProfiles.find((item) => String(item.id) === id);
                      setTeamId(id);
                      setDisplayName(profile?.full_name || profile?.name || "");
                      setEmail(profile?.email || "");
                      setShowPassword(false);
                    }}>
                      <option value="">Choose a Team member</option>
                      {sortedProfiles.map((profile) => <option key={profile.id} value={String(profile.id)}>{profile.full_name || profile.name || "Unnamed Team member"}</option>)}
                    </select>
                    {!sortedProfiles.length && <small>Add a Team profile before creating an admin account.</small>}
                  </label>
                ) : <label className="form-field-group"><span className="form-field-label">Display name</span><input className="form-text-input" value={displayName} disabled={busy} onChange={(event) => setDisplayName(event.target.value)} maxLength="120" placeholder="Officer name" /></label>}
                <label className="form-field-group"><span className="form-field-label">Email address</span><input className="form-text-input" type="email" required disabled={busy} readOnly={editor.mode === "edit"} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" /></label>
                {editor.mode === "create" && <div className="form-field-group"><label className="form-field-label" htmlFor="admin-initial-password">Initial password</label><input id="admin-initial-password" className="form-text-input" type={showPassword ? "text" : "password"} readOnly value={passwordPreview.value} autoComplete="off" /><button type="button" className="btn-secondary" disabled={busy || !passwordPreview.value} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide password" : "Show password"}</button><small>Generated from the Team name in its stored order: first@lastname//currentyear. This is predictable; share privately and ask the admin to change it immediately.</small>{passwordPreview.error && <small role="alert">{passwordPreview.error}</small>}</div>}
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
              <button type="submit" className="btn-primary" disabled={busy || !!confirmation || (editor.mode === "create" && (!passwordPreview.value || !!passwordPreview.error))}>{busy ? "Saving…" : editor.mode === "create" ? "Create admin" : "Save permissions"}</button>
            </div>
          </form>
        </div>
      )}

      <AdminConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={runConfirmedAction}
      />
    </div>
  );
}
