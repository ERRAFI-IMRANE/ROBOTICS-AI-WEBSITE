import { useCallback, useEffect, useMemo, useState } from "react";
import { closeAttendanceSession, createAttendanceSession, deleteAttendanceNotificationRecipient, deleteAttendanceSession, loadAttendanceSession, loadAttendanceWorkspace, reopenAttendanceSession, retryAttendanceDelivery, saveAttendance, saveAttendanceNotificationRecipient, updateAttendanceSession } from "../../lib/attendance";
import { supabase } from "../../lib/supabaseClient";
import { AdminConfirmDialog, AdminToast } from "./AdminActionFeedback";
import { useAdminToast } from "./useAdminToast";
import "./AdminAbsence.css";
import { loadTeamIntoAttendance, loadAttendanceTeamSeasons, summarizeAttendance } from "../../lib/attendance";

const emptyDraft = () => ({
  title: "",
  sessionType: "training",
  season: "",
  teamSeason: "",
  sessionDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  sessionTime: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(11, 16),
  notes: "",
});

function sessionEditor(session) {
  const sessionDate = new Date(session.starts_at);
  const local = new Date(sessionDate.getTime() - sessionDate.getTimezoneOffset() * 60000).toISOString();
  return {
    id: session.id,
    title: session.title || "",
    sessionType: session.session_type || "training",
    season: session.season || "",
    sessionDate: local.slice(0, 10),
    sessionTime: local.slice(11, 16),
    notes: session.notes || "",
  };
}

function editorStartsAt(editor) {
  return `${editor.sessionDate}T${editor.sessionTime || "00:00"}`;
}

const dateTime = (value) => value ? new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(value)) : "Date unavailable";

function actionLabel(action) {
  if (action.action_type === "warning_message") return `Member email warning · ${action.streak} absences`;
  if (action.action_type === "group_removal") return "Legacy removal email";
  if (action.action_type === "membership_removal") return "Membership removal email · 5 absences";
  return `Team attendance email · ${action.streak} absences`;
}

export default function AdminAbsence() {
  const [workspace, setWorkspace] = useState({ sessions: [], actions: [], seasons: [], recipients: [] });
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [rosterQuery, setRosterQuery] = useState("");
  const [participantFilter, setParticipantFilter] = useState("all");
  const [teamSeasons, setTeamSeasons] = useState([]);
  const [teamError, setTeamError] = useState("");
  const [teamSeason, setTeamSeason] = useState("");
  const [editor, setEditor] = useState(null);
  const [recipientPanel, setRecipientPanel] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState({ id: null, email: "", label: "", isActive: true });
  const [confirmation, setConfirmation] = useState(null);
  const { toast, showToast, clearToast } = useAdminToast();

  const load = useCallback(async (preferredId = "") => {
    setLoading(true);
    setError("");
    try {
      const next = await loadAttendanceWorkspace(supabase);
      setWorkspace(next);
      try {
        setTeamSeasons(await loadAttendanceTeamSeasons(supabase));
        setTeamError("");
      } catch (teamLoadError) { setTeamError(teamLoadError.message); }
      setSelectedId((current) => preferredId || (next.sessions.some((session) => session.id === current) ? current : ""));
    } catch (loadError) {
      setError(loadError.message || "Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (sessionId) => {
    if (!sessionId) { setDetail(null); return; }
    setDetailLoading(true);
    try {
      setDetail(await loadAttendanceSession(supabase, sessionId));
    } catch (loadError) {
      showToast(loadError.message || "Could not load the session roster.", "error");
    } finally {
      setDetailLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setTeamSeason(teamSeasons.some((row) => row.season === detail?.session?.season) ? detail.session.season : teamSeasons[0]?.season || "");
  }, [detail?.session?.id, detail?.session?.season, teamSeasons]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  const filteredSessions = useMemo(() => workspace.sessions.filter((session) => {
    const matchesStatus = statusFilter === "all" || session.status === statusFilter;
    const text = `${session.title} ${session.season} ${session.session_type}`.toLowerCase();
    return matchesStatus && text.includes(query.trim().toLowerCase());
  }), [workspace.sessions, statusFilter, query]);

  const filteredRecords = useMemo(() => (detail?.records || []).filter((record) => {
    const matchesType = participantFilter === "all" || record.participant_type === participantFilter;
    const term = rosterQuery.trim().toLowerCase();
    return matchesType && (!term || `${record.full_name || ""} ${record.subtitle || ""}`.toLowerCase().includes(term));
  }), [detail?.records, participantFilter, rosterQuery]);

  const overview = useMemo(() => summarizeAttendance(workspace), [workspace]);

  const setRecordStatus = (recordId, attendanceStatus) => {
    if (detail?.session?.status !== "open" || busy) return;
    setDetail((current) => ({ ...current, records: current.records.map((record) => record.id === recordId ? { ...record, attendance_status: attendanceStatus } : record) }));
  };

  const setRecordNote = (recordId, note) => {
    setDetail((current) => ({ ...current, records: current.records.map((record) => record.id === recordId ? { ...record, note } : record) }));
  };

  const persist = async ({ quiet = false } = {}) => {
    if (!detail?.session?.id || !detail.records.length) return;
    setBusy(true);
    try {
      await saveAttendance(supabase, detail.session.id, detail.records);
      if (!quiet) showToast("Attendance saved.");
      await load(detail.session.id);
      await loadDetail(detail.session.id);
    } catch (saveError) {
      showToast(saveError.message || "Attendance could not be saved.", "error");
      throw saveError;
    } finally {
      setBusy(false);
    }
  };

  const requestClose = () => {
    const unmarked = detail?.records?.filter((record) => record.attendance_status === "unmarked").length || 0;
    setConfirmation({
      title: "Close this attendance session?",
      message: `${unmarked} participant${unmarked === 1 ? "" : "s"} not marked present will be saved as absent. The roster will be locked and Gmail notifications will be processed.`,
      confirmLabel: "Close session",
      action: async () => {
        setBusy(true);
        try {
          await saveAttendance(supabase, detail.session.id, detail.records);
          const result = await closeAttendanceSession(supabase, detail.session.id);
          const failed = (result.deliveries || []).filter((item) => item.status === "failed" || item.status === "not_configured").length;
          showToast(failed ? `Session closed. ${failed} email action${failed === 1 ? " needs" : "s need"} attention.` : "Session closed and attendance emails processed.");
          await load(detail.session.id);
          await loadDetail(detail.session.id);
        } catch (closeError) {
          showToast(closeError.message || "The session could not be closed.", "error");
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const submitSession = async (event) => {
    event.preventDefault();
    if (busy || !editor) return;
    setBusy(true);
    try {
      const draft = { ...editor, startsAt: editorStartsAt(editor) };
      const created = editor.id
        ? await updateAttendanceSession(supabase, editor.id, draft)
        : await createAttendanceSession(supabase, draft);
      if (!editor.id && editor.teamSeason) {
        try { await loadTeamIntoAttendance(supabase, created.id, editor.teamSeason); }
        catch (teamLoadError) { setTeamError(teamLoadError.message); }
      }
      setEditor(null);
      showToast(editor.id ? "Session settings updated." : "Session created. Review the roster below.");
      await load(created.id);
      await loadDetail(created.id);
    } catch (createError) {
      showToast(createError.message || "The session could not be saved.", "error");
    } finally {
      setBusy(false);
    }
  };

  const requestReopenSession = (session) => setConfirmation({
    title: "This session is already saved",
    message: "Are you sure you want to enter it again? The session will become editable. Emails that were already sent stay in the audit and will not be sent twice automatically.",
    confirmLabel: "Yes, reopen session",
    action: async () => {
      setBusy(true);
      try {
        await reopenAttendanceSession(supabase, session.id);
        setSelectedId(session.id);
        setRosterQuery("");
        setParticipantFilter("all");
        setEditor(sessionEditor(session));
        await load(session.id);
        await loadDetail(session.id);
        showToast("Session reopened. You can edit its settings and attendance.");
      } catch (reopenError) {
        showToast(reopenError.message || "The saved session could not be reopened.", "error");
      } finally {
        setBusy(false);
      }
    },
  });

  const selectSession = (session) => {
    if (session.status === "closed") {
      requestReopenSession(session);
      return;
    }
    setDetail(null);
    setSelectedId(session.id);
    setRosterQuery("");
    setParticipantFilter("all");
  };

  const backToSessions = async () => {
    if (busy || detailLoading) return;
    try {
      if (detail?.session?.status === "open") await persist({ quiet: true });
      setSelectedId("");
      setDetail(null);
      setRosterQuery("");
      setParticipantFilter("all");
    } catch {
      // Keep the session open if its draft could not be saved.
    }
  };

  const retry = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await retryAttendanceDelivery(supabase, action.id);
      const outcome = result.deliveries?.[0];
      if (outcome?.status === "failed" || outcome?.status === "not_configured") throw new Error(outcome.error || "Email delivery is still unavailable.");
      showToast("Attendance email sent.");
      await load(detail.session.id);
      await loadDetail(detail.session.id);
    } catch (retryError) {
      showToast(retryError.message || "Attendance email could not be retried.", "error");
    } finally {
      setBusy(false);
    }
  };

  const addTeamRoster = async () => {
    if (busy || !teamSeason || !detail?.session?.id) return;
    setBusy(true);
    try {
      if (detail.records.length) await saveAttendance(supabase, detail.session.id, detail.records);
      const result = await loadTeamIntoAttendance(supabase, detail.session.id, teamSeason);
      await load(detail.session.id);
      await loadDetail(detail.session.id);
      setParticipantFilter("team");
      setRosterQuery("");
      setTeamError("");
      showToast(`${result.team_count ?? result.added} Team profiles loaded. ${result.converted || 0} existing members identified as Team.`);
    } catch (rosterError) {
      setTeamError(rosterError.message || "Could not load Team profiles.");
      showToast(rosterError.message || "Could not load Team profiles.", "error");
    } finally { setBusy(false); }
  };

  const resetRecipientDraft = () => setRecipientDraft({ id: null, email: "", label: "", isActive: true });

  const submitRecipient = async (event) => {
    event.preventDefault();
    if (busy || !recipientDraft.email.trim()) return;
    setBusy(true);
    try {
      await saveAttendanceNotificationRecipient(supabase, recipientDraft);
      showToast(recipientDraft.id ? "Notification email updated." : "Notification email added.");
      resetRecipientDraft();
      await load(selectedId);
    } catch (recipientError) {
      showToast(recipientError.message || "Notification email could not be saved.", "error");
    } finally {
      setBusy(false);
    }
  };

  const requestDeleteRecipient = (recipient) => setConfirmation({
    title: "Remove this notification email?",
    message: `${recipient.email} will stop receiving attendance warnings and removal notices.`,
    confirmLabel: "Remove email",
    action: async () => {
      setBusy(true);
      try {
        await deleteAttendanceNotificationRecipient(supabase, recipient.id);
        if (recipientDraft.id === recipient.id) resetRecipientDraft();
        showToast("Notification email removed.");
        await load(selectedId);
      } catch (recipientError) {
        showToast(recipientError.message || "Notification email could not be removed.", "error");
      } finally {
        setBusy(false);
      }
    },
  });

  const requestDeleteSession = (session) => setConfirmation({
    title: "Delete this attendance session?",
    message: `“${session.title}” and its attendance records will be permanently deleted. Emails already delivered cannot be recalled.`,
    confirmLabel: "Delete session",
    tone: "danger",
    action: async () => {
      setBusy(true);
      try {
        await deleteAttendanceSession(supabase, session.id);
        setSelectedId("");
        setDetail(null);
        setRosterQuery("");
        setParticipantFilter("all");
        setEditor(null);
        await load();
        showToast("Attendance session deleted.");
      } catch (deleteError) {
        showToast(deleteError.message || "The attendance session could not be deleted.", "error");
      } finally {
        setBusy(false);
      }
    },
  });

  const isOpen = detail?.session?.status === "open";
  const presentCount = detail?.records?.filter((record) => record.attendance_status === "present").length || 0;
  const totalCount = detail?.records?.length || 0;

  return (
    <div className="admin-tab-content admin-attendance-view" aria-busy={loading || detailLoading || busy}>
      <AdminToast toast={toast} onClose={clearToast} />
      <div className="admin-view-header">
        <div><h1 className="admin-page-title">Absence</h1><p className="admin-page-desc">Mark only who is present. Everyone left unchecked becomes absent when the session is closed.</p></div>
        <div className="admin-header-actions"><button type="button" className="btn-secondary" onClick={() => setRecipientPanel(true)} disabled={busy}>Notification emails ({workspace.recipients.filter((item) => item.is_active).length})</button><button type="button" className="btn-secondary" onClick={() => load(selectedId)} disabled={loading || busy}>Refresh</button><button type="button" className="btn-primary" onClick={() => setEditor({ ...emptyDraft(), season: workspace.seasons[0] || "", teamSeason: teamSeasons.find((row) => row.season === workspace.seasons[0])?.season || teamSeasons[0]?.season || "" })} disabled={busy}>+ New session</button></div>
      </div>

      {error && <div className="admin-inline-error" role="alert"><span>{error}</span><button type="button" className="btn-secondary" onClick={() => load()}>Retry</button></div>}

      {teamError && <div className="admin-inline-error" role="alert">{teamError}</div>}
      {!selectedId && <section className="attendance-overview" aria-label="Attendance overview">
        <article><span>Sessions</span><strong>{loading ? "—" : overview.sessions}</strong><small>{overview.live} live sessions</small></article>
        <article><span>Attendance</span><strong>{loading || overview.attendance === null ? "—" : overview.attendance + "%"}</strong><small>Across saved sessions</small></article>
        <article><span>Notified people</span><strong>{loading ? "—" : overview.notified}</strong><small>Distinct profiles with sent notices</small></article>
        <article><span>Refused members</span><strong>{loading ? "—" : overview.refused}</strong><small>Recorded attendance removals</small></article>
      </section>}
      {selectedId && <div className="admin-attendance-back"><button type="button" className="btn-secondary" onClick={backToSessions} disabled={busy || detailLoading}>← Back to sessions</button></div>}

      <div className="admin-attendance-layout">
        {!selectedId && <aside className="admin-panel admin-attendance-session-panel" aria-label="Attendance sessions">
          <div className="admin-attendance-session-tools">
            <div className="admin-attendance-tabs">{["all", "open", "closed"].map((item) => <button key={item} type="button" className={statusFilter === item ? "is-active" : ""} onClick={() => setStatusFilter(item)}>{item}</button>)}</div>
            <input type="search" placeholder="Search sessions…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search attendance sessions" />
          </div>
          <div className="admin-attendance-session-list">
            {loading && [1, 2, 3].map((item) => <div className="admin-attendance-session-card is-loading" key={item}><span className="skeleton-shimmer skeleton-line" /></div>)}
            {!loading && !filteredSessions.length && <div className="admin-empty-state">No attendance sessions in this view.</div>}
            {!loading && filteredSessions.map((session) => <button type="button" key={session.id} className={`admin-attendance-session-card ${selectedId === session.id ? "is-selected" : ""}`} onClick={() => selectSession(session)}>
              <span className={`admin-attendance-session-status is-${session.status}`}>{session.status === "closed" ? "saved" : "live"}</span>
              <strong>{session.title}</strong><small>{dateTime(session.starts_at)}</small>
              <span className="admin-attendance-session-meta"><span>{session.season}</span><span>{session.attendance.present}/{session.attendance.total} present · {session.attendance.total ? Math.round(session.attendance.present / session.attendance.total * 100) : 0}%</span></span>
              <span className="admin-attendance-progress" aria-hidden="true"><i style={{ width: `${session.attendance.total ? (session.attendance.present / session.attendance.total) * 100 : 0}%` }} /></span>
            </button>)}
          </div>
        </aside>}

        {selectedId && <section className="admin-panel admin-attendance-roster-panel">
          {detailLoading && <div className="admin-attendance-detail-loading"><span className="skeleton-shimmer skeleton-line" /><span className="skeleton-shimmer skeleton-line" /><span className="skeleton-shimmer skeleton-line" /></div>}
          {!detailLoading && detail && <>
            <header className="admin-attendance-roster-header"><div><span className={`admin-attendance-session-status is-${detail.session.status}`}>{detail.session.status === "closed" ? "saved" : "live"}</span><h2>{detail.session.title}</h2><p>{dateTime(detail.session.starts_at)} · {detail.session.season} · {detail.session.session_type}</p></div><div className="admin-attendance-roster-summary"><div className="admin-attendance-session-actions"><button type="button" className="btn-secondary" onClick={() => isOpen ? setEditor(sessionEditor(detail.session)) : requestReopenSession(detail.session)} disabled={busy}>{isOpen ? "Edit settings" : "Reopen & edit"}</button><button type="button" className="btn-secondary btn-danger" onClick={() => requestDeleteSession(detail.session)} disabled={busy}>Delete session</button></div><div className="admin-attendance-completion"><strong>{presentCount}/{totalCount}</strong><span>present</span></div></div></header>
            {isOpen && <div className="admin-attendance-bulkbar"><p><strong>Presence checklist</strong><span>Check present people only. Unchecked people become absent when you close the session.</span></p><div><button type="button" className="btn-secondary" onClick={() => setDetail((current) => ({ ...current, records: current.records.map((record) => ({ ...record, attendance_status: "unmarked" })) }))} disabled={busy}>Clear</button><button type="button" className="btn-secondary" onClick={() => setDetail((current) => ({ ...current, records: current.records.map((record) => ({ ...record, attendance_status: "present" })) }))} disabled={busy}>Mark all present</button></div></div>}

            <div className="admin-attendance-roster-tools"><label><span className="sr-only">Search participants by name</span><input type="search" value={rosterQuery} onChange={(event) => setRosterQuery(event.target.value)} placeholder="Search participant by name…" /></label><div className="admin-attendance-participant-filters" aria-label="Filter participants">{[{ id: "all", label: "All" }, { id: "registration", label: "Members" }, { id: "team", label: "Team" }].map((filter) => <button type="button" key={filter.id} className={participantFilter === filter.id ? "is-active" : ""} onClick={() => setParticipantFilter(filter.id)}>{filter.label}<span>{filter.id === "all" ? totalCount : detail.records.filter((record) => record.participant_type === filter.id).length}</span></button>)}</div></div>

            {isOpen && <div className="admin-attendance-bulkbar admin-attendance-team-loader"><label className="admin-attendance-field"><span>Team season</span><select className="form-select-input" value={teamSeason} onChange={(event) => setTeamSeason(event.target.value)} disabled={busy}><option value="">Choose Team season</option>{teamSeasons.map((row) => <option key={row.season} value={row.season}>{row.season} · {row.eligible_count} eligible</option>)}</select></label><p><span>Load the bureau for this session. Supervisors, co-supervisors and advisors are excluded.</span></p><button type="button" className="btn-secondary" onClick={addTeamRoster} disabled={busy || !teamSeason}>Load Team</button></div>}

            <div className="admin-attendance-roster" role="list">
              {!filteredRecords.length && <div className="admin-empty-state admin-attendance-roster-empty">No participants match this search and filter.</div>}
              {filteredRecords.map((record) => <article className="admin-attendance-person" key={record.id} role="listitem">
                <div className="admin-attendance-person-copy"><span className={`admin-attendance-source is-${record.participant_type}`}>{record.participant_type === "team" ? "TEAM" : "MEMBER"}</span><strong>{record.full_name || "Unnamed participant"}</strong><small>{record.subtitle || "Club participant"}</small></div>
                <button type="button" className={`admin-attendance-present-toggle ${record.attendance_status === "present" ? "is-present" : record.attendance_status === "absent" ? "is-absent" : ""}`} aria-pressed={record.attendance_status === "present"} onClick={() => setRecordStatus(record.id, record.attendance_status === "present" ? "unmarked" : "present")} disabled={!isOpen || busy}><span aria-hidden="true">{record.attendance_status === "present" ? "✓" : record.attendance_status === "absent" ? "×" : "○"}</span>{record.attendance_status === "present" ? "Present" : record.attendance_status === "absent" ? "Absent" : "Mark present"}</button>
                <input className="admin-attendance-note" type="text" value={record.note || ""} onChange={(event) => setRecordNote(record.id, event.target.value)} maxLength="500" placeholder="Optional note" disabled={!isOpen || busy} aria-label={`Note for ${record.full_name}`} />
              </article>)}
            </div>

            {isOpen && <footer className="admin-attendance-footer"><span><strong>{detail.records.filter((record) => record.attendance_status !== "present").length}</strong> unchecked — these people will be recorded absent</span><div><button type="button" className="btn-secondary" onClick={() => persist()} disabled={busy}>Save draft</button><button type="button" className="btn-primary" onClick={requestClose} disabled={busy}>Close &amp; send emails</button></div></footer>}

            {!!detail.actions?.length && <section className="admin-attendance-actions"><header><div><p className="admin-eyebrow">Rule audit</p><h3>Email warnings &amp; actions</h3></div></header><div className="admin-attendance-action-list">{detail.actions.map((action) => <article key={action.id}><span className={`admin-attendance-action-icon is-${action.action_type}`}>{action.action_type === "group_removal" || action.action_type === "membership_removal" ? "×" : "!"}</span><div><strong>{action.full_name}</strong><p>{actionLabel(action)}</p>{action.last_error && <small>{action.last_error}</small>}</div><span className={`admin-attendance-delivery is-${action.delivery_status}`}>{action.delivery_status.replaceAll("_", " ")}</span>{["failed", "not_configured"].includes(action.delivery_status) && <button type="button" className="btn-secondary" onClick={() => retry(action)} disabled={busy}>Retry email</button>}</article>)}</div></section>}
          </>}
        </section>}
      </div>

      {editor && <div className="admin-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditor(null); }}><form className="admin-modal-dialog admin-attendance-editor" role="dialog" aria-modal="true" aria-labelledby="attendance-editor-title" onSubmit={submitSession}>
        <header className="admin-modal-header"><div><p className="admin-eyebrow">{editor.id ? "Session settings" : "New attendance"}</p><h2 className="admin-modal-title" id="attendance-editor-title">{editor.id ? "Edit the session" : "Create a session"}</h2><p>{editor.id ? "Update the title, type, calendar date, time, or notes." : "The roster is generated from accepted members and eligible Team roles."}</p></div><button type="button" className="admin-modal-close-btn" onClick={() => setEditor(null)} disabled={busy} aria-label="Close">×</button></header>
        <div className="admin-modal-body admin-attendance-form-grid">
          <label className="admin-attendance-field is-wide"><span>Session title</span><input className="form-text-input" required minLength="2" maxLength="140" value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} placeholder="Weekly robotics workshop" /></label>
          <label className="admin-attendance-field"><span>Type</span><select className="form-select-input" value={editor.sessionType} onChange={(event) => setEditor({ ...editor, sessionType: event.target.value })}>{["training", "meeting", "event", "workshop", "other"].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
          <label className="admin-attendance-field"><span>Season</span><select className="form-select-input" required disabled={Boolean(editor.id)} value={editor.season} onChange={(event) => setEditor({ ...editor, season: event.target.value })}><option value="">Choose season</option>{workspace.seasons.map((season) => <option value={season} key={season}>{season}</option>)}</select>{editor.id && <small>The season stays fixed because it defines this session roster.</small>}</label>
          {!editor.id && <label className="admin-attendance-field is-wide"><span>Bureau / Team season</span><select className="form-select-input" value={editor.teamSeason || ""} onChange={(event) => setEditor({ ...editor, teamSeason: event.target.value })}><option value="">Use the session season</option>{teamSeasons.map((row) => <option key={row.season} value={row.season}>{row.season} · {row.eligible_count} eligible profiles</option>)}</select><small>Eligible Team profiles are included when the session is created.</small></label>}
          <label className="admin-attendance-field"><span>Calendar date</span><input className="form-text-input" required type="date" value={editor.sessionDate} onChange={(event) => setEditor({ ...editor, sessionDate: event.target.value })} /></label>
          <label className="admin-attendance-field"><span>Time</span><input className="form-text-input" required type="time" value={editor.sessionTime} onChange={(event) => setEditor({ ...editor, sessionTime: event.target.value })} /></label>
          <label className="admin-attendance-field is-wide"><span>Notes <small>optional</small></span><textarea maxLength="2000" rows="4" value={editor.notes} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} placeholder="Session topic, room, or instructions" /></label>
        </div>
        <footer className="admin-modal-footer"><button type="button" className="btn-secondary" onClick={() => setEditor(null)} disabled={busy}>Cancel</button><button type="submit" className="btn-primary" disabled={busy || !editor.season || !editor.sessionDate || !editor.sessionTime}>{busy ? "Saving…" : editor.id ? "Apply changes" : "Create session"}</button></footer>
      </form></div>}

      {recipientPanel && <div className="admin-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRecipientPanel(false); }}><section className="admin-modal-dialog admin-attendance-recipient-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-recipient-title">
        <header className="admin-modal-header"><div><p className="admin-eyebrow">Gmail copies</p><h2 className="admin-modal-title" id="attendance-recipient-title">Absence notification emails</h2><p>All active addresses receive attendance warnings and membership notices.</p></div><button type="button" className="admin-modal-close-btn" onClick={() => setRecipientPanel(false)} disabled={busy} aria-label="Close">×</button></header>
        <div className="admin-modal-body admin-attendance-recipient-body">
          <form className="admin-attendance-recipient-form" onSubmit={submitRecipient}>
            <label className="admin-attendance-field"><span>Name / role <small>optional</small></span><input className="form-text-input" maxLength="100" value={recipientDraft.label} onChange={(event) => setRecipientDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Club president" /></label>
            <label className="admin-attendance-field"><span>Email address</span><input className="form-text-input" type="email" required value={recipientDraft.email} onChange={(event) => setRecipientDraft((current) => ({ ...current, email: event.target.value }))} placeholder="admin@example.com" /></label>
            <label className="admin-attendance-active-toggle"><input type="checkbox" checked={recipientDraft.isActive} onChange={(event) => setRecipientDraft((current) => ({ ...current, isActive: event.target.checked }))} /><span>Receive notifications</span></label>
            <div className="admin-attendance-recipient-form-actions">{recipientDraft.id && <button type="button" className="btn-secondary" onClick={resetRecipientDraft} disabled={busy}>Cancel edit</button>}<button type="submit" className="btn-primary" disabled={busy || !recipientDraft.email.trim()}>{busy ? "Saving…" : recipientDraft.id ? "Update email" : "Add email"}</button></div>
          </form>
          <div className="admin-attendance-recipient-list">
            {!workspace.recipients.length && <div className="admin-empty-state"><strong>No admin emails configured</strong><span>Add at least one address so the bureau receives every attendance notice.</span></div>}
            {workspace.recipients.map((recipient) => <article key={recipient.id}><span className={`admin-attendance-recipient-state ${recipient.is_active ? "is-active" : ""}`} aria-hidden="true" /><div><strong>{recipient.label || "Attendance admin"}</strong><a href={`mailto:${recipient.email}`}>{recipient.email}</a></div><span className="admin-attendance-recipient-badge">{recipient.is_active ? "Active" : "Paused"}</span><button type="button" className="btn-secondary" onClick={() => setRecipientDraft({ id: recipient.id, email: recipient.email, label: recipient.label || "", isActive: recipient.is_active })} disabled={busy}>Edit</button><button type="button" className="btn-secondary btn-danger" onClick={() => requestDeleteRecipient(recipient)} disabled={busy}>Remove</button></article>)}
          </div>
        </div>
        <footer className="admin-modal-footer"><span className="admin-attendance-recipient-hint">The sender Gmail account itself is configured securely in Vercel, not here.</span><button type="button" className="btn-secondary" onClick={() => setRecipientPanel(false)} disabled={busy}>Done</button></footer>
      </section></div>}

      <AdminConfirmDialog confirmation={confirmation} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={async () => { const action = confirmation?.action; setConfirmation(null); await action?.(); }} />
    </div>
  );
}
