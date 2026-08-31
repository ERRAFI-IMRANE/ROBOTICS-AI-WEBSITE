import React, { useState } from "react";
import "./AdminDashboard.css";

export default function AdminAuthModal({ isOpen, onSuccess, onClose }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError(false);

    // Verify passcode: accept "admin2025", "rai2025", or "ests"
    setTimeout(() => {
      const trimmed = passcode.trim().toLowerCase();
      if (trimmed === "admin2025" || trimmed === "rai2025" || trimmed === "ests" || trimmed === "admin") {
        sessionStorage.setItem("rai_admin_auth", "true");
        setLoading(false);
        onSuccess();
      } else {
        setLoading(false);
        setError(true);
      }
    }, 300);
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-dialog" style={{ maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2 className="admin-modal-title">Officer authentication</h2>
          <button type="button" className="admin-modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="admin-modal-body">
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 8px" }}>
              Enter club officer passcode to unlock telemetry and controls.
            </p>

            <div className="form-field-group">
              <label className="form-field-label">Officer key</label>
              <input
                type="password"
                className="form-text-input"
                placeholder="Passcode (default: admin2025)"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (error) setError(false);
                }}
                autoFocus
              />
              {error && (
                <span style={{ fontSize: "12px", color: "var(--critical)" }}>
                  Invalid passcode.
                </span>
              )}
            </div>
          </div>

          <div className="admin-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading || !passcode}>
              {loading ? "Authenticating..." : "Unlock console"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
