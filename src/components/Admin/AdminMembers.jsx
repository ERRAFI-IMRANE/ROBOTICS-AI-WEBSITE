import React, { useState, useEffect, useRef } from "react";
import { decideRegistration } from "../../lib/clubSettings";
import { supabase } from "../../lib/supabaseClient";
import { getYearOfStudyLabel } from "../../constants/registrationConstants";
import { readRegistrationSettings, setRegistrationOpen } from "../../lib/registration";
import "./AdminDashboard.css";

export default function AdminMembers() {
  const [activeSubTab, setActiveSubTab] = useState("queue"); // "queue" | "members" | "refused"
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const decisionLock = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMsg, setToastMsg] = useState(null);

  // Data sets from Supabase
  const [registrations, setRegistrations] = useState([]);
  const [members, setMembers] = useState([]);
  const [refusedMembers, setRefusedMembers] = useState([]);
  const [portalSettings, setPortalSettings] = useState(null);
  const [portalBusy, setPortalBusy] = useState(false);

  // Refusal Modal State
  const [refusalModalOpen, setRefusalModalOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [refusalReason, setRefusalReason] = useState("");

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      // 1. Fetch registrations (queue)
      const { data: regData, error: regError } = await supabase
        .from("registrations")
        .select("*")
        .order("created_at", { ascending: false });

      if (regError) throw regError;
      setRegistrations(Array.isArray(regData) ? regData : []);

      // 2. Fetch regular members
      const { data: memData, error: memError } = await supabase
        .from("members")
        .select("*")
        .order("created_at", { ascending: false });

      if (memError) throw memError;
      if (Array.isArray(memData)) {
        setMembers(memData);
      }

      // 3. Fetch refused members
      const { data: refData, error: refError } = await supabase
        .from("refused_members")
        .select("*")
        .order("refused_at", { ascending: false });

      if (refError) throw refError;
      if (Array.isArray(refData)) {
        setRefusedMembers(refData);
      }

      // 4. Fetch portal settings
      setPortalSettings(await readRegistrationSettings(supabase));
    } catch (err) {
      setLoadError("Could not load admissions. Retry before making any decisions.");
      setPortalSettings(null);
      console.warn("Error loading members/registrations data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAccept = async (app) => {
    if (decisionLock.current || loadError) return;
    if (!window.confirm(`Accept ${app.full_name || "this applicant"} as a club member?`)) return;
    decisionLock.current = true;
    setDecisionBusy(true);
    try {
      await decideRegistration(supabase, app.id, "accepted");
      showToast(`Accepted ${app.full_name || "applicant"} into club members.`);
      await loadData();
    } catch (err) {
      showToast("Acceptance failed: " + err.message);
    } finally {
      decisionLock.current = false;
      setDecisionBusy(false);
    }
  };

  const handleConfirmRefusal = async (event) => {
    event.preventDefault();
    if (!selectedApplicant || decisionLock.current || loadError) return;
    decisionLock.current = true;
    setDecisionBusy(true);
    try {
      await decideRegistration(supabase, selectedApplicant.id, "refused", refusalReason);
      setRefusalModalOpen(false);
      showToast("Application refused and safely archived.");
      await loadData();
    } catch (err) {
      showToast("Refusal failed: " + err.message);
    } finally {
      decisionLock.current = false;
      setDecisionBusy(false);
    }
  };

  const handleCloseRegistration = async () => {
    if (
      portalBusy ||
      !window.confirm(
        "Close applications for this season? New submissions will be disabled. Existing applications will remain available for review."
      )
    ) {
      return;
    }

    try {
      setPortalBusy(true);
      setPortalSettings(await setRegistrationOpen(supabase, portalSettings, false));
      showToast("Registration cycle successfully closed.");
      await loadData();
    } catch (err) {
      showToast("Error closing registration: " + err.message);
    } finally {
      setPortalBusy(false);
    }
  };

  const handleOpenRegistration = async () => {
    if (
      portalBusy ||
      !window.confirm("Reopen the registration portal for new student submissions?")
    ) {
      return;
    }

    try {
      setPortalBusy(true);
      setPortalSettings(await setRegistrationOpen(supabase, portalSettings, true));
      showToast("Registration portal is now open.");
      await loadData();
    } catch (err) {
      showToast("Error opening registration: " + err.message);
    } finally {
      setPortalBusy(false);
    }
  };

  const pendingCount = registrations.filter(
    (a) => !a.status || a.status.toLowerCase() === "pending"
  ).length;

  const filteredMembers = members.filter((m) => {
    const q = searchQuery.toLowerCase();
    const name = (m.full_name || "").toLowerCase();
    const email = (m.email || "").toLowerCase();
    const dept = (m.department || "").toLowerCase();
    const fil = (m.filiere || "").toLowerCase();
    return name.includes(q) || email.includes(q) || dept.includes(q) || fil.includes(q);
  });

  return (
    <div className="admin-tab-content" aria-busy={decisionBusy}>
      {loadError && (
        <div className="admin-inline-error" role="alert">
          <span>{loadError}</span>
          <button className="btn-secondary" onClick={loadData} style={{ marginLeft: "auto" }}>
            Retry
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && <div className="admin-toast-bar" role="status">{toastMsg}</div>}

      {/* Page Header */}
      <div className="admin-view-header">
        <div>
          <p className="admin-eyebrow">COMMUNITY & TALENT PIPELINE</p>
          <h1 className="admin-page-title">Members & admissions</h1>
          <p className="admin-page-desc">
            Incoming candidates, verified student engineers, and admission portal controls.
          </p>
        </div>
      </div>

      {/* Subtab Navigation & Registration Capsule */}
      <div className="member-filters-bar">
        <div className="admin-subtabs-nav">
          <button
            type="button"
            className={`admin-subtab-btn ${activeSubTab === "queue" ? "is-active" : ""}`}
            onClick={() => setActiveSubTab("queue")}
          >
            <span>Admissions queue</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: pendingCount > 0 ? "var(--warning)" : "var(--text-muted)" }}>
              ({pendingCount > 0 ? `${pendingCount} pending` : registrations.length})
            </span>
          </button>

          <button
            type="button"
            className={`admin-subtab-btn ${activeSubTab === "members" ? "is-active" : ""}`}
            onClick={() => setActiveSubTab("members")}
          >
            <span>Active roster</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>
              ({members.length})
            </span>
          </button>

          <button
            type="button"
            className={`admin-subtab-btn ${activeSubTab === "refused" ? "is-active" : ""}`}
            onClick={() => setActiveSubTab("refused")}
          >
            <span>Declined archive</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>
              ({refusedMembers.length})
            </span>
          </button>
        </div>

        {/* Portal Status Capsule */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            background: "var(--bg-elevated)",
            padding: "4px 10px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Portal ({portalSettings?.season || "2025-2026"}):
          </span>
          <span className={`status-chip status-chip-${portalSettings?.is_open ? "positive" : "critical"}`}>
            <span className="status-chip-dot" />
            <span>{portalSettings?.is_open ? "Open" : "Closed"}</span>
          </span>

          {portalSettings?.is_open ? (
            <button
              type="button"
              className="btn-secondary btn-danger"
              style={{ height: "28px", padding: "0 10px", fontSize: "11px" }}
              onClick={handleCloseRegistration}
              disabled={loading || portalBusy || !portalSettings?.id}
              title="Close registration intake"
            >
              {portalBusy ? "Updating…" : "Close intake"}
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              style={{ height: "28px", padding: "0 10px", fontSize: "11px", borderColor: "var(--positive)", color: "var(--positive)" }}
              onClick={handleOpenRegistration}
              disabled={loading || portalBusy || !portalSettings?.id}
              title="Reopen registration cycle"
            >
              {portalBusy ? "Updating…" : "Open intake"}
            </button>
          )}
        </div>
      </div>

      {/* 1. ADMISSIONS QUEUE */}
      {activeSubTab === "queue" && (
        <div className="admin-panel" style={{ padding: "0" }}>
          <div className="admin-panel-header" style={{ padding: "16px 20px", margin: 0 }}>
            <div>
              <h3 className="admin-panel-heading">Applicant submissions ({registrations.length})</h3>
              <p className="admin-panel-meta">Incoming student submissions awaiting officer decision</p>
            </div>
          </div>

          <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
            <table className="hairline-table">
              <thead>
                <tr>
                  <th>Student applicant</th>
                  <th>Phone / WhatsApp</th>
                  <th>Department</th>
                  <th>Filière</th>
                  <th>Year of study</th>
                  <th>Message / Notes</th>
                  <th>Cycle</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="skeleton-row">
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "70%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "45%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "55%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "40%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "35%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "80%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "40%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "35%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "50%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "60%" }} /></td>
                    </tr>
                  ))
                ) : registrations.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="admin-empty-state">
                      No incoming student registrations in queue.
                    </td>
                  </tr>
                ) : (
                  registrations.map((app) => {
                    const isPending = !app.status || app.status.toLowerCase() === "pending";
                    const appName = app.full_name || app.name || "Candidate";
                    const appEmail = app.email || "-";
                    const appPhone = app.phone || "-";
                    const appDept = app.department || "-";
                    const appFiliere = app.filiere || "-";
                    const appYear = getYearOfStudyLabel(app.years_of_study) || app.years_of_study || "-";
                    const appSeason = app.registration_season || "-";
                    const appMessage = app.message || app.motivation || "";
                    const appDate = app.created_at ? new Date(app.created_at).toLocaleDateString() : app.appliedDate || "-";

                    return (
                      <tr key={app.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{appName}</div>
                          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{appEmail}</div>
                        </td>
                        <td style={{ fontSize: "12px", fontFamily: "var(--font-mono)" }}>
                          {appPhone}
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--text)" }}>{appDept}</span>
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--accent)", fontWeight: 500 }}>{appFiliere}</span>
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{appYear}</span>
                        </td>
                        <td style={{ maxWidth: "200px" }}>
                          {appMessage ? (
                            <span style={{ fontSize: "12px", color: "var(--text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              &ldquo;{appMessage}&rdquo;
                            </span>
                          ) : (
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic" }}>No message</span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{appSeason}</span>
                        </td>
                        <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>{appDate}</td>
                        <td>
                          <span
                            className={`status-chip status-chip-${
                              isPending ? "warning" : app.status === "accepted" || app.status === "Accepted" ? "positive" : "critical"
                            }`}
                          >
                            <span className="status-chip-dot" />
                            <span>{app.status || "pending"}</span>
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {isPending ? (
                            <div style={{ display: "inline-flex", gap: "6px" }}>
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={() => handleAccept(app)}
                                disabled={decisionBusy || Boolean(loadError)}
                                style={{ height: "30px", padding: "0 10px", fontSize: "12px" }}
                                title="Admit candidate into regular members table"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="btn-secondary btn-danger"
                                onClick={() => {
                                  setSelectedApplicant(app);
                                  setRefusalReason("");
                                  setRefusalModalOpen(true);
                                }}
                                style={{ height: "30px", padding: "0 10px", fontSize: "12px" }}
                                title="Decline application into refused_members"
                              >
                                Decline
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Processed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. ACTIVE MEMBERS SUBTAB */}
      {activeSubTab === "members" && (
        <div className="admin-panel" style={{ padding: "0" }}>
          <div
            className="admin-panel-header"
            style={{ padding: "16px 20px", margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}
          >
            <div>
              <h3 className="admin-panel-heading">Active student roster ({members.length})</h3>
              <p className="admin-panel-meta">Regular club members admitted into the active community</p>
            </div>

            <div style={{ minWidth: "260px" }}>
              <input
                type="text"
                className="form-text-input"
                placeholder="Search member, email, filière..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ height: "34px", fontSize: "12px" }}
              />
            </div>
          </div>

          <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
            <table className="hairline-table">
              <thead>
                <tr>
                  <th>Member name</th>
                  <th>Phone / WhatsApp</th>
                  <th>Department</th>
                  <th>Filière</th>
                  <th>Year of study</th>
                  <th>Cycle</th>
                  <th>Date joined</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="skeleton-row">
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "65%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "40%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "50%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "40%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "35%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "30%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "35%" }} /></td>
                    </tr>
                  ))
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="admin-empty-state">
                      {members.length === 0
                        ? "No regular members admitted yet. Accept candidates from Admissions queue to populate roster."
                        : "No matching members found for search criteria."}
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((mem) => (
                    <tr key={mem.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{mem.full_name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{mem.email}</div>
                      </td>
                      <td style={{ fontSize: "12px", fontFamily: "var(--font-mono)" }}>
                        {mem.phone || "-"}
                      </td>
                      <td>
                        <span style={{ fontSize: "12px", color: "var(--text)" }}>{mem.department || "-"}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: "12px", color: "var(--accent)", fontWeight: 500 }}>{mem.filiere || "-"}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {getYearOfStudyLabel(mem.years_of_study) || mem.years_of_study || "-"}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                          {mem.registration_season || "2025-2026"}
                        </span>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {mem.joined_at ? new Date(mem.joined_at).toLocaleDateString() : mem.created_at ? new Date(mem.created_at).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. DECLINED ARCHIVE */}
      {activeSubTab === "refused" && (
        <div className="admin-panel" style={{ padding: "0" }}>
          <div className="admin-panel-header" style={{ padding: "16px 20px", margin: 0 }}>
            <div>
              <h3 className="admin-panel-heading">Declined applications archive ({refusedMembers.length})</h3>
              <p className="admin-panel-meta">Archived candidate records and refusal logs</p>
            </div>
          </div>

          <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
            <table className="hairline-table">
              <thead>
                <tr>
                  <th>Candidate name</th>
                  <th>Phone / WhatsApp</th>
                  <th>Department & Filière</th>
                  <th>Year of study</th>
                  <th>Decline notes / Reason</th>
                  <th>Cycle</th>
                  <th>Date declined</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="skeleton-row">
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "65%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "40%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "50%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "35%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "70%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "30%" }} /></td>
                      <td><div className="skeleton-shimmer skeleton-line" style={{ width: "35%" }} /></td>
                    </tr>
                  ))
                ) : refusedMembers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="admin-empty-state">
                      No declined applications archived.
                    </td>
                  </tr>
                ) : (
                  refusedMembers.map((ref) => (
                    <tr key={ref.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{ref.full_name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{ref.email}</div>
                      </td>
                      <td style={{ fontSize: "12px", fontFamily: "var(--font-mono)" }}>
                        {ref.phone || "-"}
                      </td>
                      <td>
                        <div style={{ fontSize: "12px", color: "var(--text)" }}>{ref.department}</div>
                        <div style={{ fontSize: "11px", color: "var(--accent)" }}>{ref.filiere}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {getYearOfStudyLabel(ref.years_of_study) || ref.years_of_study || "-"}
                        </span>
                      </td>
                      <td style={{ maxWidth: "240px" }}>
                        <span style={{ fontSize: "12px", color: "var(--critical)" }}>
                          {ref.refusal_reason || "Criteria not met"}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                          {ref.registration_season || "-"}
                        </span>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {ref.refused_at ? new Date(ref.refused_at).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Refusal Confirmation Modal */}
      {refusalModalOpen && selectedApplicant && (
        <div
          className="admin-modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !decisionBusy) setRefusalModalOpen(false);
          }}
        >
          <div className="admin-modal-window" style={{ maxWidth: "480px" }}>
            <div className="admin-panel-header" style={{ margin: "0 0 16px" }}>
              <div>
                <p className="admin-eyebrow">DECLINE APPLICANT</p>
                <h2 className="admin-panel-heading" style={{ fontSize: "18px" }}>Confirm application decline</h2>
              </div>
              <button
                type="button"
                className="btn-hairline-icon"
                onClick={() => setRefusalModalOpen(false)}
                disabled={decisionBusy}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmRefusal}>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 16px" }}>
                Provide reason for declining <strong>{selectedApplicant.full_name || selectedApplicant.name}</strong>&apos;s application:
              </p>

              <div className="form-field-group" style={{ marginBottom: "20px" }}>
                <label className="form-field-label">Decline reason / Notes *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Prerequisites not met for current embedded robotics track..."
                  maxLength={2000}
                  value={refusalReason}
                  onChange={(e) => setRefusalReason(e.target.value)}
                  className="form-textarea-input"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setRefusalModalOpen(false)}
                  disabled={decisionBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={decisionBusy || Boolean(loadError)}
                  className="btn-primary btn-danger"
                >
                  {decisionBusy ? "Archiving…" : "Confirm decline"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
