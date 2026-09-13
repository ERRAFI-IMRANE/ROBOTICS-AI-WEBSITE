import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getYearOfStudyLabel } from "../../constants/registrationConstants";
import { readRegistrationSettings, setRegistrationOpen } from "../../lib/registration";
import { completeRegistrationReview, saveRegistrationInterview, setRegistrationInteresting } from "../../lib/registrationInterview";
import { supabase } from "../../lib/supabaseClient";
import { AdminToast } from "./AdminActionFeedback";
import AdminInterviewWizard from "./AdminInterviewWizard";
import { useAdminToast } from "./useAdminToast";
import "./AdminDashboard.css";

export default function AdminMembers({ initialRegistrations = null, initialSettings = null, onDataChange = () => {} }) {
  const hasInitialData = Array.isArray(initialRegistrations) && initialSettings;
  const [registrations, setRegistrations] = useState(hasInitialData ? initialRegistrations : []);
  const [settings, setSettings] = useState(hasInitialData ? initialSettings : null);
  const [loading, setLoading] = useState(!hasInitialData);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [interviewStatus, setInterviewStatus] = useState("all");
  const [interestingOnly, setInterestingOnly] = useState(false);
  const [season, setSeason] = useState("all");
  const [interviewing, setInterviewing] = useState(null);
  const [interviewBusy, setInterviewBusy] = useState(false);
  const [interestingBusy, setInterestingBusy] = useState(false);
  const { toast, showToast, clearToast } = useAdminToast();

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

  const togglePortal = async () => {
    if (!settings?.id || busy) return;
    const nextState = !settings.is_open;
    const message = nextState ? "Reopen registration for new submissions?" : "Stop registration for new submissions? Existing applications will stay available.";
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const updated = await setRegistrationOpen(supabase, settings, nextState);
      setSettings(updated);
      showToast(`Registration is now ${nextState ? "open" : "closed"}.`);
    } catch (err) {
      setError(err.message || "The registration status could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  const saveInterview = async (answers) => {
    if (!interviewing || interviewBusy) return;
    setInterviewBusy(true);
    try {
      const updated = await saveRegistrationInterview(supabase, interviewing.id, answers);
      const nextRegistrations = registrations.map((row) => String(row.id) === String(updated.id) ? { ...row, ...updated } : row);
      setRegistrations(nextRegistrations);
      onDataChange(nextRegistrations, settings);
      setInterviewing(null);
      showToast(`${interviewing.full_name || "Applicant"}'s interview was saved.`);
      return updated;
    } catch (saveError) {
      showToast(saveError.message || "The interview could not be saved.", "error");
      throw saveError;
    } finally {
      setInterviewBusy(false);
    }
  };

  const completeReview = async (answers, decision, refusalReason) => {
    if (!interviewing || interviewBusy) return;
    setInterviewBusy(true);
    try {
      const updated = await completeRegistrationReview(supabase, interviewing.id, answers, decision, refusalReason);
      const nextRegistrations = registrations.map((row) => String(row.id) === String(updated.id) ? { ...row, ...updated } : row);
      setRegistrations(nextRegistrations);
      onDataChange(nextRegistrations, settings);
      setInterviewing(null);
      showToast(`${interviewing.full_name || "Applicant"} was ${decision}.`);
      return updated;
    } catch (reviewError) {
      showToast(reviewError.message || "The application review could not be completed.", "error");
      throw reviewError;
    } finally {
      setInterviewBusy(false);
    }
  };

  const toggleInteresting = async () => {
    if (!interviewing || interestingBusy) return;
    const nextValue = interviewing.interesting !== true;
    setInterestingBusy(true);
    try {
      const updated = await setRegistrationInteresting(supabase, interviewing.id, nextValue);
      const nextRegistrations = registrations.map((row) => String(row.id) === String(updated.id) ? { ...row, ...updated } : row);
      setRegistrations(nextRegistrations);
      setInterviewing((current) => current && String(current.id) === String(updated.id) ? { ...current, ...updated } : current);
      onDataChange(nextRegistrations, settings);
      showToast(`${interviewing.full_name || "Applicant"} ${nextValue ? "marked as Interesting" : "removed from Interesting candidates"}.`);
      return updated;
    } catch (flagError) {
      showToast(flagError.message || "The Interesting flag could not be updated.", "error");
      throw flagError;
    } finally {
      setInterestingBusy(false);
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
    const appInterviewStatus = app.interview_completed === true ? "interviewed" : "not-interviewed";
    const haystack = [app.full_name, app.email, app.department, app.filiere, app.phone, app.message, app.refusal_reason, app.registration_season].join(" ").toLowerCase();
    return (status === "all" || appStatus === status)
      && (interviewStatus === "all" || appInterviewStatus === interviewStatus)
      && (!interestingOnly || app.interesting === true)
      && (season === "all" || app.registration_season === season)
      && haystack.includes(query.toLowerCase());
  });

  return (
    <div className="admin-tab-content admin-registration-view" aria-busy={busy || interviewBusy || interestingBusy}>
      <AdminToast toast={toast} onClose={clearToast} />
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
          <button type="button" className={`filter-pill-btn admin-interesting-filter ${interestingOnly ? "is-active" : ""}`} onClick={() => setInterestingOnly((current) => !current)} aria-pressed={interestingOnly}>★ Interesting Candidates</button>
        </div>
        <div className="admin-registration-filter-fields">
          <select className="form-select-input" value={season} onChange={(event) => setSeason(event.target.value)} aria-label="Filter by registration season">
            <option value="all">All seasons</option>
            {seasons.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="form-select-input" value={interviewStatus} onChange={(event) => setInterviewStatus(event.target.value)} aria-label="Filter by interview status">
            <option value="all">All interview statuses</option>
            <option value="interviewed">Interviewed</option>
            <option value="not-interviewed">Not interviewed</option>
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
                      <div><small>APPLICANT</small><div className="admin-registration-name-row"><h3>{app.full_name || "Unnamed applicant"}</h3>{app.interesting === true && <span className="admin-interesting-badge" title="Interesting candidate">★ Interesting</span>}</div><span>{app.email || "No email"} · {app.phone || "No phone"}</span></div>
                      <div className="admin-registration-card-controls">
                        <div className="admin-registration-status-stack">
                          <span className={`status-chip status-chip-${pending ? "warning" : appStatus === "accepted" ? "positive" : "critical"}`}><span className="status-chip-dot" />{appStatus}</span>
                          <span className={`admin-interview-status ${app.interview_completed === true ? "is-complete" : ""}`}>{app.interview_completed === true ? "Interviewed" : "Not interviewed"}</span>
                        </div>
                        <button type="button" className="btn-secondary admin-interview-action" onClick={() => setInterviewing(app)} disabled={busy || interviewBusy}>
                          Review
                        </button>
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

      {interviewing && <AdminInterviewWizard
        key={`${interviewing.id}-${interviewing.interviewed_at || "new"}`}
        applicant={interviewing}
        saving={interviewBusy}
        interestingSaving={interestingBusy}
        onCancel={() => { if (!interviewBusy && !interestingBusy) setInterviewing(null); }}
        onSave={saveInterview}
        onDecision={completeReview}
        onToggleInteresting={toggleInteresting}
      />}
    </div>
  );
}
