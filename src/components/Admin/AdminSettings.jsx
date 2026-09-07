import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { normalizeSeason, readClubSettings, saveClubSettings } from "../../lib/clubSettings";
import { readRegistrationSettings, setRegistrationOpen } from "../../lib/registration";
import "./AdminDashboard.css";

export default function AdminSettings() {
  const [values, setValues] = useState({ current_season: "", public_staff_season: "" });
  const [seasons, setSeasons] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settings, registration, roster] = await Promise.all([
        readClubSettings(supabase),
        readRegistrationSettings(supabase),
        supabase.from("team_seasons").select("season"),
      ]);
      if (roster.error) throw new Error("Staff seasons could not be loaded. Please retry.");
      setValues(settings);
      setCampaign(registration);
      setSeasons(
        [...new Set((roster.data || []).map((row) => normalizeSeason(row.season)).filter(Boolean))]
          .sort()
          .reverse()
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveClubSettings(supabase, values);
      await load();
      setNotice("Settings successfully saved. Changes are now active across the club console and public website.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleCampaign() {
    if (busy || !campaign?.id) return;
    const open = !campaign.is_open;
    if (
      !window.confirm(
        `${open ? "Open" : "Close"} applications for ${campaign.season}? Existing applications will remain safely preserved.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setCampaign(await setRegistrationOpen(supabase, campaign, open));
      setNotice(`Applications successfully ${open ? "opened" : "closed"}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-tab-content">
      {/* View Header */}
      <div className="admin-view-header">
        <div>
          <p className="admin-eyebrow">CLUB CONTROL / PARAMETERS</p>
          <h1 className="admin-page-title">Season & publishing</h1>
          <p className="admin-page-desc">
            Primary configuration for student recruitment cycles, active academic seasons, and public roster visibility.
          </p>
        </div>
        <div className="admin-header-actions">
          <button className="btn-secondary" onClick={load} disabled={busy || loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert">{error}</div>}
      {notice && <div className="admin-inline-success" role="status">{notice}</div>}

      <div className="admin-settings-grid">
        {/* Card 01: Academic Seasons */}
        <form className="admin-panel admin-settings-card" onSubmit={save}>
          <div>
            <span className="admin-section-number">01 / SEASONS CONFIGURATION</span>
            <h2>Active academic periods</h2>
            <p className="admin-page-desc" style={{ marginTop: "4px" }}>
              Admissions and staff publishing are completely independent. You can open a new recruitment cycle while keeping last season’s staff on the website.
            </p>
          </div>

          <fieldset
            disabled={loading || busy}
            style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div className="form-field-group">
              <label className="form-field-label" htmlFor="current-season">
                Current academic season (e.g. 2025-2026)
              </label>
              {loading ? (
                <div className="skeleton-shimmer skeleton-line" style={{ height: "38px" }} />
              ) : (
                <input
                  id="current-season"
                  className="form-text-input"
                  required
                  placeholder="2025-2026"
                  pattern="20[0-9]{2}-20[0-9]{2}"
                  value={values.current_season}
                  onChange={(e) => setValues({ ...values, current_season: e.target.value })}
                />
              )}
              <p className="admin-panel-meta">
                Changing season closes other intake cycles but never modifies existing applications.
              </p>
            </div>

            <div className="form-field-group">
              <label className="form-field-label" htmlFor="public-staff-season">
                Staff season shown on public site
              </label>
              {loading ? (
                <div className="skeleton-shimmer skeleton-line" style={{ height: "38px" }} />
              ) : (
                <select
                  id="public-staff-season"
                  className="form-select-input"
                  required
                  value={values.public_staff_season}
                  onChange={(e) => setValues({ ...values, public_staff_season: e.target.value })}
                >
                  <option value="">Select a staff season</option>
                  {[...new Set([...seasons, values.public_staff_season].filter(Boolean))].map((season) => (
                    <option key={season} value={season}>
                      {season}
                    </option>
                  ))}
                </select>
              )}
              <p className="admin-panel-meta">
                The public Team section will display only this roster. Staff records in other seasons remain accessible in the console.
              </p>
            </div>

            <button
              className="btn-primary"
              type="submit"
              disabled={loading || busy}
              style={{ alignSelf: "flex-start", marginTop: "8px" }}
            >
              {busy ? "Saving parameters…" : "Save parameters ↗"}
            </button>
          </fieldset>
        </form>

        {/* Card 02: Recruitment Campaign Portal */}
        <div className="admin-panel admin-settings-card">
          <div>
            <span className="admin-section-number">02 / ADMISSIONS PIPELINE</span>
            <h2>Recruitment intake portal</h2>
            <p className="admin-page-desc" style={{ marginTop: "4px" }}>
              Control when prospective students can submit membership applications via the public Join portal.
            </p>
          </div>

          <div className="admin-campaign-summary">
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Target Campaign
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--text)", fontWeight: 700 }}>
                {campaign?.season || "No active campaign"}
              </span>
            </div>

            {loading ? (
              <div className="skeleton-shimmer skeleton-line" style={{ width: "60px", height: "24px", borderRadius: "9999px" }} />
            ) : (
              <span className={`status-chip status-chip-${campaign?.is_open ? "positive" : "critical"}`}>
                <span className="status-chip-dot" />
                <span>{campaign?.is_open ? "Intake Open" : "Intake Closed"}</span>
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              className={campaign?.is_open ? "btn-secondary btn-danger" : "btn-primary"}
              disabled={busy || loading || !campaign?.id}
              onClick={toggleCampaign}
            >
              {busy
                ? "Updating portal…"
                : campaign?.is_open
                ? "Close applications"
                : "Open applications ↗"}
            </button>
          </div>

          <p className="admin-panel-meta">
            Closing the recruitment cycle freezes the public form without impacting pending reviews or admitted members.
          </p>

          <img className="admin-settings-sign" src="/RAI/club sign.png" alt="Robotics & AI Club" />
        </div>
      </div>
    </div>
  );
}
