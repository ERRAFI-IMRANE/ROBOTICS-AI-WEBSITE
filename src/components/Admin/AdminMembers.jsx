import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import { getYearOfStudyLabel } from "../../constants/registrationConstants";
import "./AdminDashboard.css";

export default function AdminMembers() {
  const [activeSubTab, setActiveSubTab] = useState("queue"); // "queue" | "members" | "refused"
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMsg, setToastMsg] = useState(null);

  // Data sets from Supabase
  const [registrations, setRegistrations] = useState([]);
  const [members, setMembers] = useState([]);
  const [refusedMembers, setRefusedMembers] = useState([]);
  const [portalSettings, setPortalSettings] = useState({ is_open: true, active_season: "2025-2026" });

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
    try {
      // 1. Fetch registrations (queue)
      const { data: regData, error: regError } = await supabase
        .from("registrations")
        .select("*")
        .order("created_at", { ascending: false });

      if (!regError && Array.isArray(regData)) {
        setRegistrations(regData);
      } else {
        const local = localStorage.getItem("rai_admin_registrations");
        setRegistrations(local ? JSON.parse(local) : []);
      }

      // 2. Fetch regular members
      const { data: memData, error: memError } = await supabase
        .from("members")
        .select("*")
        .order("created_at", { ascending: false });

      if (!memError && Array.isArray(memData)) {
        setMembers(memData);
      }

      // 3. Fetch refused members
      const { data: refData, error: refError } = await supabase
        .from("refused_members")
        .select("*")
        .order("refused_at", { ascending: false });

      if (!refError && Array.isArray(refData)) {
        setRefusedMembers(refData);
      }

      // 4. Fetch portal settings
      const { data: setts, error: settsError } = await supabase
        .from("registration_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (!settsError && setts) {
        setPortalSettings(setts);
      }
    } catch (err) {
      console.warn("Error loading members/registrations data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Accept applicant into members table
  const handleAccept = async (app) => {
    const applicantName = app.full_name || app.name || "Candidate";
    const applicantId = app.id;

    try {
      // 1. Try atomic database stored procedure first
      const { error: rpcError } = await supabase.rpc("accept_club_registration", {
        p_registration_id: applicantId,
      });

      if (rpcError) {
        // Fallback: Two-step transaction
        // Step 1: Insert into regular members table (NOT team!)
        const { error: insertError } = await supabase.from("members").insert([
          {
            full_name: applicantName,
            email: app.email,
            phone: app.phone,
            department: app.department || "",
            filiere: app.filiere || "",
            years_of_study: app.years_of_study || "first_year",
            message: app.message || null,
            registration_season: app.registration_season || portalSettings?.active_season || "2025-2026",
            joined_at: new Date().toISOString(),
          },
        ]);

        if (insertError) {
          throw new Error("Failed to insert into members: " + insertError.message);
        }

        // Step 2: Delete from registrations only after member insertion succeeds
        const { error: delError } = await supabase
          .from("registrations")
          .delete()
          .eq("id", applicantId);

        if (delError) {
          console.warn("Could not delete from registrations:", delError);
        }
      }

      showToast(`Accepted ${applicantName} into club members.`);
      await loadData();
    } catch (err) {
      console.error("Accept applicant error:", err);
      showToast("Error accepting applicant: " + err.message);
    }
  };

  // Decline applicant into refused_members table
  const handleConfirmRefusal = async (e) => {
    e.preventDefault();
    if (!selectedApplicant) return;

    const applicantName = selectedApplicant.full_name || selectedApplicant.name || "Candidate";
    const applicantId = selectedApplicant.id;
    const reason = refusalReason.trim() || "Criteria not met for this cycle";

    try {
      // 1. Try atomic database stored procedure first
      const { error: rpcError } = await supabase.rpc("refuse_club_registration", {
        p_registration_id: applicantId,
        p_reason: reason,
      });

      if (rpcError) {
        // Fallback: Two-step transaction
        // Step 1: Insert into refused_members
        const { error: insertError } = await supabase.from("refused_members").insert([
          {
            original_registration_id: applicantId,
            full_name: applicantName,
            email: selectedApplicant.email,
            phone: selectedApplicant.phone,
            department: selectedApplicant.department || "",
            filiere: selectedApplicant.filiere || "",
            years_of_study: selectedApplicant.years_of_study || "first_year",
            message: selectedApplicant.message || null,
            registration_season: selectedApplicant.registration_season || portalSettings?.active_season || "2025-2026",
            refusal_reason: reason,
            refused_at: new Date().toISOString(),
          },
        ]);

        if (insertError) {
          throw new Error("Failed to record refused applicant: " + insertError.message);
        }

        // Step 2: Delete from registrations only after refused_members insertion succeeds
        const { error: delError } = await supabase
          .from("registrations")
          .delete()
          .eq("id", applicantId);

        if (delError) {
          console.warn("Could not delete from registrations:", delError);
        }
      }

      setRefusalModalOpen(false);
      showToast(`Application for ${applicantName} declined.`);
      await loadData();
    } catch (err) {
      console.error("Refusal error:", err);
      showToast("Error declining application: " + err.message);
    }
  };

  // Close registration cycle with safety check
  const handleCloseRegistration = async () => {
    const pendingList = registrations.filter(
      (a) => !a.status || a.status.toLowerCase() === "pending"
    );

    if (pendingList.length > 0) {
      alert(
        `Cannot close registration!\n\n` +
        `There are currently ${pendingList.length} pending application(s) in the recruitment queue.\n` +
        `Please accept or refuse all pending applications before closing the registration cycle.`
      );
      return;
    }

    if (!window.confirm("Confirm closing registration for the current cycle? Public submissions will be disabled.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("registration_settings")
        .update({
          is_open: false,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;
      showToast("Registration cycle successfully closed.");
      await loadData();
    } catch (err) {
      showToast("Error closing registration: " + err.message);
    }
  };

  // Reopen registration cycle
  const handleOpenRegistration = async () => {
    if (!window.confirm("Reopen the registration portal for new student submissions?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("registration_settings")
        .update({
          is_open: true,
          closed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;
      showToast("Registration portal is now open.");
      await loadData();
    } catch (err) {
      showToast("Error opening registration: " + err.message);
    }
  };

  const pendingCount = registrations.filter(
    (a) => !a.status || a.status.toLowerCase() === "pending"
  ).length;

  // Filter regular members by search
  const filteredMembers = members.filter((m) => {
    const q = searchQuery.toLowerCase();
    const name = (m.full_name || "").toLowerCase();
    const email = (m.email || "").toLowerCase();
    const dept = (m.department || "").toLowerCase();
    const fil = (m.filiere || "").toLowerCase();
    return name.includes(q) || email.includes(q) || dept.includes(q) || fil.includes(q);
  });

  return (
    <div className="admin-tab-content">
      {/* Toast Notification */}
      {toastMsg && <div className="admin-toast-bar">{toastMsg}</div>}

      {/* Page Header */}
      <div className="admin-view-header">
        <div>
          <h1 className="admin-page-title">Club members & admissions</h1>
          <p className="admin-page-desc">
            Admitted regular club members (table: members), recruitment queue, and registration portal controls.
          </p>
        </div>
      </div>

      {/* Sub Tab Switcher & Portal Control Bar */}
      <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "12px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn-secondary ${activeSubTab === "queue" ? "btn-primary" : ""}`}
            onClick={() => setActiveSubTab("queue")}
            style={{ fontSize: "13px" }}
          >
            Admissions queue {pendingCount > 0 ? `(${pendingCount} pending)` : `(${registrations.length})`}
          </button>

          <button
            type="button"
            className={`btn-secondary ${activeSubTab === "members" ? "btn-primary" : ""}`}
            onClick={() => setActiveSubTab("members")}
            style={{ fontSize: "13px" }}
          >
            Active members ({members.length})
          </button>

          <button
            type="button"
            className={`btn-secondary ${activeSubTab === "refused" ? "btn-primary" : ""}`}
            onClick={() => setActiveSubTab("refused")}
            style={{ fontSize: "13px" }}
          >
            Declined archive ({refusedMembers.length})
          </button>
        </div>

        {/* Portal Status Indicator & Season Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--bg-elevated)", padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--border)" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Portal ({portalSettings?.active_season || "2025-2026"}):
          </span>
          <span className={`status-chip status-chip-${portalSettings?.is_open ? "positive" : "critical"}`} style={{ padding: "2px 8px" }}>
            <span className="status-chip-dot" />
            <span style={{ fontSize: "11px" }}>{portalSettings?.is_open ? "Open" : "Closed"}</span>
          </span>

          {portalSettings?.is_open ? (
            <button
              type="button"
              className="btn-secondary btn-danger"
              style={{ padding: "3px 8px", fontSize: "11px", marginLeft: "4px" }}
              onClick={handleCloseRegistration}
              title="Close registration cycle"
            >
              Close portal
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: "3px 8px", fontSize: "11px", marginLeft: "4px", borderColor: "var(--positive)", color: "var(--positive)" }}
              onClick={handleOpenRegistration}
              title="Reopen registration cycle"
            >
              Reopen portal
            </button>
          )}
        </div>
      </div>

      {/* 1. ADMISSIONS QUEUE SUBTAB */}
      {activeSubTab === "queue" && (
        <div className="admin-panel" style={{ marginTop: "16px" }}>
          <div className="admin-panel-header">
            <div>
              <h3 className="admin-panel-heading">Admissions queue (table: registrations)</h3>
              <p className="admin-panel-meta">Incoming student submissions awaiting officer decision</p>
            </div>
          </div>

          <div className="table-container">
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
                  <tr>
                    <td colSpan={10} style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
                      Loading admissions queue...
                    </td>
                  </tr>
                ) : registrations.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: "36px", textAlign: "center", color: "var(--text-muted)" }}>
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
                                style={{ padding: "4px 8px", fontSize: "12px" }}
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
                                style={{ padding: "4px 8px", fontSize: "12px" }}
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
        <div className="admin-panel" style={{ marginTop: "16px" }}>
          <div className="admin-panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 className="admin-panel-heading">Club members roster ({members.length})</h3>
              <p className="admin-panel-meta">Regular members admitted into the club (table: members)</p>
            </div>

            <div style={{ minWidth: "240px" }}>
              <input
                type="text"
                className="form-text-input"
                placeholder="Search member, email, or filière..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: "12px", padding: "6px 10px" }}
              />
            </div>
          </div>

          <div className="table-container">
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
                  <tr>
                    <td colSpan={7} style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
                      Loading regular members roster...
                    </td>
                  </tr>
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "36px", textAlign: "center", color: "var(--text-muted)" }}>
                      {members.length === 0
                        ? "No regular members admitted yet. Accept candidates from the Admissions queue to populate this roster."
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

      {/* 3. DECLINED ARCHIVE SUBTAB */}
      {activeSubTab === "refused" && (
        <div className="admin-panel" style={{ marginTop: "16px" }}>
          <div className="admin-panel-header">
            <div>
              <h3 className="admin-panel-heading">Declined applications archive ({refusedMembers.length})</h3>
              <p className="admin-panel-meta">Permanently logged refused candidates and notes (table: refused_members)</p>
            </div>
          </div>

          <div className="table-container">
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
                  <tr>
                    <td colSpan={7} style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
                      Loading refused applications...
                    </td>
                  </tr>
                ) : refusedMembers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "36px", textAlign: "center", color: "var(--text-muted)" }}>
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
        <div className="admin-modal-overlay">
          <div className="admin-modal-dialog" style={{ maxWidth: "480px" }}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Decline registration</h2>
              <button type="button" className="admin-modal-close-btn" onClick={() => setRefusalModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmRefusal}>
              <div className="admin-modal-body">
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 12px" }}>
                  Provide reason for declining <strong>{selectedApplicant.full_name || selectedApplicant.name}</strong>&apos;s application:
                </p>

                <div className="form-field-group">
                  <label className="form-field-label">Decline notes *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Prerequisite lab experience not met for current embedded systems track..."
                    value={refusalReason}
                    onChange={(e) => setRefusalReason(e.target.value)}
                    className="form-textarea"
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setRefusalModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary btn-danger">
                  Confirm decline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
