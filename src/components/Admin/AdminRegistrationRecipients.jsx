import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { deleteRegistrationNotificationRecipient, loadRegistrationNotificationRecipients, saveRegistrationNotificationRecipient } from "../../lib/registrationNotifications";
import { AdminConfirmDialog } from "./AdminActionFeedback";

const emptyDraft = () => ({ id: null, email: "", label: "", isActive: true });

export default function AdminRegistrationRecipients({ onClose, onFeedback }) {
  const dialogRef = useRef(null);
  const actionLock = useRef(false);
  const [recipients, setRecipients] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRecipients(await loadRegistrationNotificationRecipients(supabase));
    } catch (err) {
      setError(err.message || "Could not load notification emails.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    void load();
    return () => dialog.close();
  }, [load]);

  const runAction = async () => {
    if (actionLock.current || !confirmation) return;
    actionLock.current = true;
    setBusy(true);
    setConfirmation(null);
    setError("");
    try {
      if (confirmation.removeId) {
        await deleteRegistrationNotificationRecipient(supabase, confirmation.removeId);
        if (draft.id === confirmation.removeId) setDraft(emptyDraft());
        onFeedback("Notification email removed.");
      } else {
        await saveRegistrationNotificationRecipient(supabase, confirmation.draft);
        setDraft(emptyDraft());
        onFeedback(confirmation.draft.id ? "Notification email updated." : "Notification email added.");
      }
      await load();
    } catch (err) {
      setError(err.message || "Notification email could not be updated.");
      onFeedback(err.message || "Notification email could not be updated.", "error");
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const disabled = loading || busy;
  return (
    <>
      <dialog ref={dialogRef} className="admin-modal-dialog admin-registration-recipient-dialog"
        aria-labelledby="registration-recipient-title"
        onCancel={(event) => { event.preventDefault(); if (!actionLock.current && !confirmation) onClose(); }}>
        <header className="admin-modal-header">
          <div><p className="admin-eyebrow">Acceptance notifications</p><h2 className="admin-modal-title" id="registration-recipient-title">Notification emails</h2><p className="admin-registration-recipient-hint">All active addresses receive an email asking them to add accepted members to WhatsApp manually.</p></div>
          <button type="button" className="admin-modal-close-btn" onClick={onClose} disabled={busy} aria-label="Close notification emails">×</button>
        </header>
        <div className="admin-modal-body">
          {error && <div className="admin-inline-error" role="alert"><span>{error}</span><button type="button" className="btn-secondary" onClick={load} disabled={disabled}>Retry</button></div>}
          <form className="admin-registration-recipient-form" onSubmit={(event) => {
            event.preventDefault();
            if (disabled || confirmation) return;
            setConfirmation({ title: draft.id ? "Update notification email?" : "Add notification email?",
              message: `${draft.email.trim()} will ${draft.isActive ? "receive" : "not receive"} new acceptance notifications.`,
              confirmLabel: "Save email", draft: { ...draft } });
          }}>
            <label><span>Name / role <small>optional</small></span><input className="form-text-input" maxLength={100} disabled={disabled} value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Club president" /></label>
            <label><span>Email address</span><input className="form-text-input" type="email" required disabled={disabled} value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="admin@example.com" /></label>
            <label className="admin-registration-recipient-toggle"><input type="checkbox" checked={draft.isActive} disabled={disabled} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} /><span>Receive notifications</span></label>
            <div className="admin-registration-recipient-actions">{draft.id && <button type="button" className="btn-secondary" onClick={() => setDraft(emptyDraft())} disabled={disabled}>Cancel edit</button>}<button type="submit" className="btn-primary" disabled={disabled || !draft.email.trim()}>{busy ? "Saving…" : draft.id ? "Update email" : "Add email"}</button></div>
          </form>
          <div className="admin-registration-recipient-list" aria-busy={loading}>
            {loading ? <div className="admin-empty-state" role="status">Loading notification emails…</div> : !recipients.length && !error ? <div className="admin-empty-state">No admin emails configured. Add at least one active address to receive acceptance notifications.</div> : null}
            {!loading && recipients.map((recipient) => <article key={recipient.id}>
              <span className={`admin-registration-recipient-state ${recipient.is_active ? "is-active" : ""}`} aria-hidden="true" />
              <div><strong>{recipient.label || "Registration admin"}</strong><a href={`mailto:${recipient.email}`}>{recipient.email}</a></div>
              <span className="status-chip">{recipient.is_active ? "Active" : "Paused"}</span>
              <div className="admin-registration-recipient-actions"><button type="button" className="btn-secondary" disabled={disabled} onClick={() => setDraft({ id: recipient.id, email: recipient.email, label: recipient.label || "", isActive: recipient.is_active })} aria-label={`Edit ${recipient.email}`}>Edit</button>
                <button type="button" className="btn-secondary btn-danger" disabled={disabled} onClick={() => setConfirmation({ title: "Remove notification email?", message: `${recipient.email} will stop receiving acceptance notifications.`, confirmLabel: "Remove email", tone: "danger", removeId: recipient.id })} aria-label={`Remove ${recipient.email}`}>Remove</button></div>
            </article>)}
          </div>
        </div>
        <footer className="admin-modal-footer"><span className="admin-registration-recipient-hint">Sender credentials stay on the server. This list is separate from Presence notification emails.</span><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Done</button></footer>
      </dialog>
      <AdminConfirmDialog confirmation={confirmation} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={runAction} />
    </>
  );
}
