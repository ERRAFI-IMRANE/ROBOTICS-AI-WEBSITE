import { useEffect, useRef } from "react";

export function AdminToast({ toast, onClose }) {
  const popoverRef = useRef(null);

  useEffect(() => {
    const element = popoverRef.current;
    if (!element || !toast) return undefined;
    try {
      if (typeof element.showPopover === "function") element.showPopover();
      else element.removeAttribute("popover");
    } catch {
      // The fixed-position fallback remains visible in older browsers.
    }
    return () => {
      try {
        element.hidePopover?.();
      } catch {
        // It may already have been removed from the top layer.
      }
    };
  }, [toast]);

  if (!toast) return null;
  const isError = toast.type === "error";

  return (
    <div
      ref={popoverRef}
      popover="manual"
      className={`admin-action-toast is-${isError ? "error" : "success"}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <span className="admin-action-toast-icon" aria-hidden="true">{isError ? "!" : "✓"}</span>
      <div>
        <strong>{isError ? "Action failed" : "Action completed"}</strong>
        <p>{toast.message}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss notification">×</button>
    </div>
  );
}

export function AdminConfirmDialog({ confirmation, busy = false, onCancel, onConfirm }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmation && !dialog.open) dialog.showModal();
    if (!confirmation && dialog.open) dialog.close();
  }, [confirmation]);

  return (
    <dialog
      ref={dialogRef}
      className="admin-confirm-dialog"
      aria-labelledby="admin-confirm-title"
      aria-describedby="admin-confirm-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClose={() => { if (!busy && confirmation) onCancel(); }}
    >
      {confirmation && (
        <div className="admin-confirm-content">
          <span className={`admin-confirm-symbol is-${confirmation.tone || "primary"}`} aria-hidden="true">
            {confirmation.tone === "danger" ? "!" : "✓"}
          </span>
          <div className="admin-confirm-copy">
            <h2 id="admin-confirm-title">{confirmation.title}</h2>
            <p id="admin-confirm-description">{confirmation.message}</p>
          </div>
          <div className="admin-confirm-actions">
            <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className={confirmation.tone === "danger" ? "btn-secondary btn-danger" : "btn-primary"}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? "Working…" : confirmation.confirmLabel || "Confirm"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
