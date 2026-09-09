import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getYearOfStudyLabel } from "../../constants/registrationConstants";
import { decideRegistration } from "../../lib/clubSettings";
import { readRegistrationSettings, setRegistrationOpen } from "../../lib/registration";
import { supabase } from "../../lib/supabaseClient";
import "./AdminDashboard.css";

export default function AdminMembers({ initialRegistrations = null, initialSettings = null, onDataChange = () => {} }) {
  const hasInitialData = Array.isArray(initialRegistrations) && initialSettings;
  const [registrations, setRegistrations] = useState(hasInitialData ? initialRegistrations : []);
  const [settings, setSettings] = useState(hasInitialData ? initialSettings : null);
  const [loading, setLoading] = useState(!hasInitialData);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [season, setSeason] = useState("all");
  const [refusing, setRefusing] = useState(null);
  const [reason, setReason] = useState("");
  const decisionLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [registrationResult, portal] = await Promise.all([
        supabase.from("registrations").select("*").order("created_at", { ascending: false }),
        readRegistrationSettings(supabase),
      ]);
      if (registrationResult.error) throw registrationResult.error;
      setRegistrations(registrationResult.data || []);
      setSettings(portal);
      onDataChange(registrationResult.data || [], portal);
    } catch (err) {
      setError(err.message || "Could not load registrations.");
    } finally {
      setLoading(false);
    }
  }, [onDataChange]);

  useEffect(() => { if (!hasInitialData) load(); }, [hasInitialData, load]);

  const flash = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const accept = async (app) => {
    if (decisionLock.current || !window.confirm(`Accept ${app.full_name || "this applicant"} as a club member?`)) return;
    decisionLock.current = true;
    setBusy(true);
    try {
      await decideRegistration(supabase, app.id, "accepted");
      flash(`${app.full_name || "Applicant"} was accepted.`);
      await load();
    } catch (err) {
      setError(err.message || "The application could not be accepted.");
    } finally {
      decisionLock.current = false;
      setBusy(false);
    }
  };

  const refuse = async (event) => {
    event.preventDefault();
    if (!refusing || decisionLock.current) return;
    decisionLock.current = true;
    setBusy(true);
    try {
      await decideRegistration(supabase, refusing.id, "refused", reason);
      setRefusing(null);
      setReason("");
      flash("Application refused and kept in registration history.");
      await load();
    } catch (err) {
      setError(err.message || "The application could not be refused.");
    } finally {
      decisionLock.current = false;
      setBusy(false);
    }
  };

  const togglePortal = async () => {
    if (!settings?.id || busy) return;
    const nextState = !settings.is_open;
    const message = nextState ? "Reopen registration for new submissions?" : "Stop registration for new submissions? Existing applications will stay available.";
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const updated = await setRegistrationOpen(supabase, settings, nextState);
      setSettings(updated);
      flash(`Registration is now ${nextState ? "open" : "closed"}.`);
    } catch (err) {
      setError(err.message || "The registration status could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => registrations.reduce((acc, row) => {
    const key = String(row.status || "pending").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}), [registrations]);

  const seasons = useMemo(() => [...new Set(registrations.map((row) => row.registration_season).filter(Boolean))].sort().reverse(), [registrations]);

  const filtered = registrations.filter((app) => {
    const appStatus = String(app.status || "pending").toLowerCase();
    const haystack = [app.full_name, app.email, app.department, app.filiere, app.phone, app.message, app.refusal_reason, app.registration_season].join(" ").toLowerCase();
    return (status === "all" || appStatus === status) && (season === "all" || app.registration_season === season) && haystack.includes(query.toLowerCase());
  });

  return (
    <div className="admin-tab-content admin-registration-view" aria-busy={busy}>
      {notice && <div className="admin-toast-bar" role="status">{notice}</div>}
      <div className="admin-view-header">
        <div><p className="admin-eyebrow">Membership intake</p><h1 className="admin-page-title">Registrations</h1><p className="admin-page-desc">Review new member applications, accept or refuse candidates, and control the public form.</p></div>
        <div className="admin-header-actions">
          <button className="btn-secondary" onClick={load} disabled={loading || busy}>Refresh</button>
          <button className={`admin-portal-control ${settings?.is_open ? "is-open" : "is-closed"}`} onClick={togglePortal} disabled={!settings?.id || busy}>
            <span className="status-chip-dot" />
            {busy ? "Updating…" : settings?.is_open ? "Stop registration" : "Open registration"}
          </button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert"><span>{error}</span><button className="btn-secondary" onClick={load}>Retry</button></div>}

      <div className="admin-registration-summary">
        <div><small>PORTAL</small><strong>{settings?.is_open ? "OPEN" : "CLOSED"}</strong><span>{settings?.season || "No active cycle"}</span></div>
        <div><small>ALL APPLICATIONS</small><strong>{registrations.length}</strong><span>Current database records</span></div>
        <div><small>PENDING REVIEW</small><strong>{counts.pending || 0}</strong><span>Needs an officer decision</span></div>
        <div><small>DECIDED</small><strong>{(counts.accepted || 0) + (counts.refused || 0)}</strong><span>Permanent registration history</span></div>
      </div>

      <div className="member-filters-bar admin-registration-filters">
        <div className="filter-pills-row">
          {["all", "pending", "accepted", "refused"].map((item) => (
            <button key={item} type="button" className={`filter-pill-btn ${status === item ? "is-active" : ""}`} onClick={() => setStatus(item)}>{item === "all" ? "All" : item}</button>
          ))}
        </div>
        <div className="admin-registration-filter-fields">
          <select className="form-select-input" value={season} onChange={(event) => setSeason(event.target.value)} aria-label="Filter by registration season">
            <option value="all">All seasons</option>
            {seasons.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input className="form-text-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applicants…" aria-label="Search registrations" />
        </div>
      </div>

      <div className="admin-panel admin-registration-list-panel">
        <div className="admin-panel-header"><div><h2 className="admin-panel-heading">Applicant queue</h2><p className="admin-panel-meta">{filtered.length} visible application{filtered.length === 1 ? "" : "s"}</p></div></div>
        <div className="admin-registration-card-list">
              {loading && [1, 2, 3].map((item) => <div key={item} className="admin-registration-card is-loading"><div className="skeleton-shimmer skeleton-line" /></div>)}
              {!loading && filtered.length === 0 && <div className="admin-empty-state">No registrations match this view.</div>}
              {!loading && filtered.map((app) => {
                const appStatus = String(app.status || "pending").toLowerCase();
                const pending = appStatus === "pending";
                return (
                  <article className="admin-registration-card" key={app.id}>
                    <header className="admin-registration-card-head">
                      <div><small>APPLICANT</small><h3>{app.full_name || "Unnamed applicant"}</h3><span>{app.email || "No email"} · {app.phone || "No phone"}</span></div>
                      <div className="admin-registration-card-controls">
                        <span className={`status-chip status-chip-${pending ? "warning" : appStatus === "accepted" ? "positive" : "critical"}`}><span className="status-chip-dot" />{appStatus}</span>
                        {pending ? <div className="admin-decision-actions"><button className="btn-primary" onClick={() => accept(app)} disabled={busy}>Accept</button><button className="btn-secondary btn-danger" onClick={() => { setRefusing(app); setReason(""); }} disabled={busy}>Refuse</button></div> : <span className="admin-processed-label">Decision saved</span>}
                      </div>
                    </header>
                    <div className="admin-registration-card-grid">
                      <div><small>DEPARTMENT</small><strong>{app.department || "Not specified"}</strong></div>
                      <div><small>FILIÈRE</small><strong>{app.filiere || "Not specified"}</strong></div>
                      <div><small>STUDY YEAR</small><strong>{getYearOfStudyLabel(app.years_of_study) || app.years_of_study || "Not specified"}</strong></div>
                      <div><small>SEASON</small><strong>{app.registration_season || "—"}</strong></div>
                      <div><small>CREATED</small><strong>{app.created_at ? new Date(app.created_at).toLocaleDateString() : "—"}</strong><span>{app.created_at ? new Date(app.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span></div>
                    </div>
                    <div className="admin-registration-card-note"><small>MESSAGE</small><p>{app.message || "No message provided."}</p></div>
                    {appStatus === "refused" && <div className="admin-registration-card-note is-refusal"><small>REFUSAL REASON</small><p>{app.refusal_reason || "No refusal reason recorded"}</p></div>}
                  </article>
                );
              })}
        </div>
      </div>

      {refusing && (
        <div className="admin-modal-overlay admin-refusal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRefusing(null); }}>
          <form className="admin-modal-dialog" onSubmit={refuse} role="dialog" aria-modal="true" aria-labelledby="refuse-title">
            <div className="admin-modal-header"><div><p className="admin-eyebrow">Application decision</p><h2 id="refuse-title" className="admin-modal-title">Refuse {refusing.full_name || "applicant"}</h2></div><button type="button" className="admin-modal-close-btn" onClick={() => setRefusing(null)}>×</button></div>
            <div className="admin-modal-body"><label className="form-field-label" htmlFor="refusal-reason">Reason for refusal</label><textarea id="refusal-reason" className="form-textarea" required minLength="3" maxLength="2000" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Add a clear reason for this decision…" /><small className="admin-reason-count">{reason.length} / 2000</small></div>
            <div className="admin-modal-footer"><button type="button" className="btn-secondary" onClick={() => setRefusing(null)}>Cancel</button><button type="submit" className="btn-primary btn-danger" disabled={busy}>{busy ? "Saving…" : "Confirm refusal"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
