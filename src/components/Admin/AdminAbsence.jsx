import { useCallback, useEffect, useMemo, useState } from "react";
import { closeAttendanceSession, createAttendanceSession, loadAttendanceSession, loadAttendanceWorkspace, retryAttendanceDelivery, saveAttendance } from "../../lib/attendance";
import { supabase } from "../../lib/supabaseClient";
import { AdminConfirmDialog, AdminToast } from "./AdminActionFeedback";
import { useAdminToast } from "./useAdminToast";
import "./AdminAbsence.css";

const ATTENDANCE_OPTIONS = [
  { id: "present", label: "Present", short: "P" },
  { id: "absent", label: "Absent", short: "A" },
  { id: "late", label: "Late", short: "L" },
  { id: "excused", label: "Excused", short: "E" },
];

const emptyDraft = () => ({
  title: "",
  sessionType: "training",
  season: "",
  startsAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  notes: "",
});

const dateTime = (value) => value ? new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(value)) : "Date unavailable";

function actionLabel(action) {
  if (action.action_type === "warning_message") return `WhatsApp warning · ${action.streak} absences`;
  if (action.action_type === "group_removal") return "WhatsApp group removal";
  if (action.action_type === "membership_removal") return "Membership moved to refused";
  return `Team warning · ${action.streak} absences`;
}

export default function AdminAbsence() {
  const [workspace, setWorkspace] = useState({ sessions: [], actions: [], seasons: [] });
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const { toast, showToast, clearToast } = useAdminToast();

  const load = useCallback(async (preferredId = "") => {
    setLoading(true);
    setError("");
    try {
      const next = await loadAttendanceWorkspace(supabase);
      setWorkspace(next);
      setSelectedId((current) => preferredId || (next.sessions.some((session) => session.id === current) ? current : next.sessions[0]?.id || ""));
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
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  const filteredSessions = useMemo(() => workspace.sessions.filter((session) => {
    const matchesStatus = statusFilter === "all" || session.status === statusFilter;
    const text = `${session.title} ${session.season} ${session.session_type}`.toLowerCase();
    return matchesStatus && text.includes(query.trim().toLowerCase());
  }), [workspace.sessions, statusFilter, query]);

  const metrics = useMemo(() => ({
    open: workspace.sessions.filter((session) => session.status === "open").length,
    completed: workspace.sessions.filter((session) => session.status === "closed").length,
    warnings: workspace.actions.filter((action) => action.action_type === "warning_message" || action.action_type === "team_warning").length,
    removals: workspace.actions.filter((action) => action.action_type === "membership_removal").length,
  }), [workspace]);

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
    if (unmarked) return showToast(`Mark the remaining ${unmarked} participant${unmarked === 1 ? "" : "s"} before closing.`, "error");
    setConfirmation({
      title: "Close this attendance session?",
      message: "The roster will be locked, consecutive absence rules will run, and eligible WhatsApp actions will be attempted.",
      confirmLabel: "Close session",
      action: async () => {
        setBusy(true);
        try {
          await saveAttendance(supabase, detail.session.id, detail.records);
          const result = await closeAttendanceSession(supabase, detail.session.id);
          const failed = (result.deliveries || []).filter((item) => item.status === "failed" || item.status === "not_configured").length;
          showToast(failed ? `Session closed. ${failed} WhatsApp action${failed === 1 ? " needs" : "s need"} attention.` : "Session closed and attendance rules processed.");
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
      const created = await createAttendanceSession(supabase, editor);
      setEditor(null);
      showToast(`Session created with ${created.participant_count} eligible participants.`);
      await load(created.id);
    } catch (createError) {
      showToast(createError.message || "The session could not be created.", "error");
    } finally {
      setBusy(false);
    }
  };

  const retry = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await retryAttendanceDelivery(supabase, action.id);
      const outcome = result.deliveries?.[0];
      if (outcome?.status === "failed" || outcome?.status === "not_configured") throw new Error(outcome.error || "WhatsApp action is still unavailable.");
      showToast("WhatsApp action completed.");
      await load(detail.session.id);
      await loadDetail(detail.session.id);
    } catch (retryError) {
      showToast(retryError.message || "WhatsApp action could not be retried.", "error");
    } finally {
      setBusy(false);
    }
  };

  const isOpen = detail?.session?.status === "open";
  const markedCount = detail?.records?.filter((record) => record.attendance_status !== "unmarked").length || 0;
  const totalCount = detail?.records?.length || 0;

  return (
    <div className="admin-tab-content admin-attendance-view" aria-busy={loading || detailLoading || busy}>
      <AdminToast toast={toast} onClose={clearToast} />
      <div className="admin-view-header">
        <div><p className="admin-eyebrow">Attendance control</p><h1 className="admin-page-title">Absence</h1><p className="admin-page-desc">Create sessions, mark attendance, and enforce progressive absence rules with a permanent audit trail.</p></div>
        <div className="admin-header-actions"><button type="button" className="btn-secondary" onClick={() => load(selectedId)} disabled={loading || busy}>Refresh</button><button type="button" className="btn-primary" onClick={() => setEditor({ ...emptyDraft(), season: workspace.seasons[0] || "" })} disabled={busy}>+ New session</button></div>
      </div>

      {error && <div className="admin-inline-error" role="alert"><span>{error}</span><button type="button" className="btn-secondary" onClick={() => load()}>Retry</button></div>}

      <section className="admin-attendance-metrics" aria-label="Attendance summary">
        <article><span className="is-blue">O</span><div><small>OPEN SESSIONS</small><strong>{metrics.open}</strong><p>Still editable</p></div></article>
        <article><span className="is-green">✓</span><div><small>CLOSED SESSIONS</small><strong>{metrics.completed}</strong><p>Rules processed</p></div></article>
        <article><span className="is-amber">!</span><div><small>WARNINGS</small><strong>{metrics.warnings}</strong><p>Team + members</p></div></article>
        <article><span className="is-red">×</span><div><small>REMOVED MEMBERS</small><strong>{metrics.removals}</strong><p>Five consecutive absences</p></div></article>
      </section>

      <div className="admin-attendance-layout">
        <aside className="admin-panel admin-attendance-session-panel" aria-label="Attendance sessions">
          <div className="admin-attendance-session-tools">
            <div className="admin-attendance-tabs">{["all", "open", "closed"].map((item) => <button key={item} type="button" className={statusFilter === item ? "is-active" : ""} onClick={() => setStatusFilter(item)}>{item}</button>)}</div>
            <input type="search" placeholder="Search sessions…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search attendance sessions" />
          </div>
          <div className="admin-attendance-session-list">
            {loading && [1, 2, 3].map((item) => <div className="admin-attendance-session-card is-loading" key={item}><span className="skeleton-shimmer skeleton-line" /></div>)}
            {!loading && !filteredSessions.length && <div className="admin-empty-state">No attendance sessions in this view.</div>}
            {!loading && filteredSessions.map((session) => <button type="button" key={session.id} className={`admin-attendance-session-card ${selectedId === session.id ? "is-selected" : ""}`} onClick={() => setSelectedId(session.id)}>
              <span className={`admin-attendance-session-status is-${session.status}`}>{session.status}</span>
              <strong>{session.title}</strong><small>{dateTime(session.starts_at)}</small>
              <span className="admin-attendance-session-meta"><span>{session.season}</span><span>{session.attendance.present + session.attendance.late}/{session.attendance.total} attended</span></span>
              <span className="admin-attendance-progress" aria-hidden="true"><i style={{ width: `${session.attendance.total ? ((session.attendance.total - session.attendance.unmarked) / session.attendance.total) * 100 : 0}%` }} /></span>
            </button>)}
          </div>
        </aside>

        <section className="admin-panel admin-attendance-roster-panel">
          {!selectedId && <div className="admin-empty-state admin-attendance-empty"><strong>Create the first attendance session</strong><span>The eligible Team and accepted-member roster will be generated automatically.</span></div>}
          {detailLoading && <div className="admin-attendance-detail-loading"><span className="skeleton-shimmer skeleton-line" /><span className="skeleton-shimmer skeleton-line" /><span className="skeleton-shimmer skeleton-line" /></div>}
          {!detailLoading && detail && <>
            <header className="admin-attendance-roster-header"><div><span className={`admin-attendance-session-status is-${detail.session.status}`}>{detail.session.status}</span><h2>{detail.session.title}</h2><p>{dateTime(detail.session.starts_at)} · {detail.session.season} · {detail.session.session_type}</p></div><div className="admin-attendance-completion"><strong>{markedCount}/{totalCount}</strong><span>marked</span></div></header>
            {isOpen && <div className="admin-attendance-bulkbar"><p><strong>Quick attendance</strong><span>Team profiles receive internal warnings only. Accepted members receive WhatsApp actions.</span></p><button type="button" className="btn-secondary" onClick={() => setDetail((current) => ({ ...current, records: current.records.map((record) => ({ ...record, attendance_status: "present" })) }))} disabled={busy}>Mark all present</button></div>}

            <div className="admin-attendance-roster" role="list">
              {detail.records.map((record) => <article className="admin-attendance-person" key={record.id} role="listitem">
                <div className="admin-attendance-person-copy"><span className={`admin-attendance-source is-${record.participant_type}`}>{record.participant_type === "team" ? "TEAM" : "MEMBER"}</span><strong>{record.full_name || "Unnamed participant"}</strong><small>{record.subtitle || "Club participant"}</small></div>
                <div className="admin-attendance-choice" aria-label={`Attendance for ${record.full_name}`}>{ATTENDANCE_OPTIONS.map((option) => <button type="button" key={option.id} title={option.label} aria-label={option.label} aria-pressed={record.attendance_status === option.id} className={`is-${option.id} ${record.attendance_status === option.id ? "is-active" : ""}`} onClick={() => setRecordStatus(record.id, option.id)} disabled={!isOpen || busy}><span>{option.short}</span><small>{option.label}</small></button>)}</div>
                <input className="admin-attendance-note" type="text" value={record.note || ""} onChange={(event) => setRecordNote(record.id, event.target.value)} maxLength="500" placeholder="Optional note" disabled={!isOpen || busy} aria-label={`Note for ${record.full_name}`} />
              </article>)}
            </div>

            {isOpen && <footer className="admin-attendance-footer"><span>{detail.records.filter((record) => record.attendance_status === "unmarked").length} unmarked</span><div><button type="button" className="btn-secondary" onClick={() => persist()} disabled={busy}>Save attendance</button><button type="button" className="btn-primary" onClick={requestClose} disabled={busy}>Close &amp; process rules</button></div></footer>}

            {!!detail.actions?.length && <section className="admin-attendance-actions"><header><div><p className="admin-eyebrow">Rule audit</p><h3>Warnings &amp; actions</h3></div></header><div className="admin-attendance-action-list">{detail.actions.map((action) => <article key={action.id}><span className={`admin-attendance-action-icon is-${action.action_type}`}>{action.action_type === "group_removal" || action.action_type === "membership_removal" ? "×" : "!"}</span><div><strong>{action.full_name}</strong><p>{actionLabel(action)}</p>{action.last_error && <small>{action.last_error}</small>}</div><span className={`admin-attendance-delivery is-${action.delivery_status}`}>{action.delivery_status.replaceAll("_", " ")}</span>{["failed", "not_configured"].includes(action.delivery_status) && ["warning_message", "group_removal"].includes(action.action_type) && <button type="button" className="btn-secondary" onClick={() => retry(action)} disabled={busy}>Retry</button>}</article>)}</div></section>}
          </>}
        </section>
      </div>

      {editor && <div className="admin-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditor(null); }}><form className="admin-modal-dialog admin-attendance-editor" role="dialog" aria-modal="true" aria-labelledby="attendance-editor-title" onSubmit={submitSession}>
        <header className="admin-modal-header"><div><p className="admin-eyebrow">New attendance</p><h2 className="admin-modal-title" id="attendance-editor-title">Create a session</h2><p>The roster is generated from accepted members and eligible Team roles.</p></div><button type="button" className="admin-modal-close-btn" onClick={() => setEditor(null)} disabled={busy} aria-label="Close">×</button></header>
        <div className="admin-modal-body admin-attendance-form-grid">
          <label className="admin-attendance-field is-wide"><span>Session title</span><input className="form-text-input" required minLength="2" maxLength="140" value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} placeholder="Weekly robotics workshop" /></label>
          <label className="admin-attendance-field"><span>Type</span><select className="form-select-input" value={editor.sessionType} onChange={(event) => setEditor({ ...editor, sessionType: event.target.value })}>{["training", "meeting", "event", "workshop", "other"].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
          <label className="admin-attendance-field"><span>Season</span><select className="form-select-input" required value={editor.season} onChange={(event) => setEditor({ ...editor, season: event.target.value })}><option value="">Choose season</option>{workspace.seasons.map((season) => <option value={season} key={season}>{season}</option>)}</select></label>
          <label className="admin-attendance-field is-wide"><span>Date &amp; time</span><input className="form-text-input" required type="datetime-local" value={editor.startsAt} onChange={(event) => setEditor({ ...editor, startsAt: event.target.value })} /></label>
          <label className="admin-attendance-field is-wide"><span>Notes <small>optional</small></span><textarea maxLength="2000" rows="4" value={editor.notes} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} placeholder="Session topic, room, or instructions" /></label>
        </div>
        <footer className="admin-modal-footer"><button type="button" className="btn-secondary" onClick={() => setEditor(null)} disabled={busy}>Cancel</button><button type="submit" className="btn-primary" disabled={busy || !editor.season}>{busy ? "Creating…" : "Create session"}</button></footer>
      </form></div>}

      <AdminConfirmDialog confirmation={confirmation} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={async () => { const action = confirmation?.action; setConfirmation(null); await action?.(); }} />
    </div>
  );
}
