import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase, publicContent } from "../../lib/supabaseClient";
import { withRequestTimeout } from "../../lib/requestTimeout";
import { deleteEvent, eventView, safeEventUrl, saveEvent } from "../../lib/adminEvents";
import "./AdminDashboard.css";

const EMPTY = {
  title: "",
  date: "",
  image_url: "/events/workshop.png",
  link: "",
  description: "",
  status: "Upcoming",
};

export default function AdminEvents({ initialEvents = null }) {
  const hasInitialEvents = Array.isArray(initialEvents);
  const [events, setEvents] = useState(hasInitialEvents ? initialEvents : []);
  const [loading, setLoading] = useState(!hasInitialEvents);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [modal, setModal] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const lock = useRef(false);
  const dialogRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await withRequestTimeout(
        publicContent.from("events").select("*").order("id", { ascending: false }),
        "Loading events"
      );
      if (result.error) throw result.error;
      setEvents(result.data || []);
    } catch (err) {
      setError(err.message || "Could not load events.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasInitialEvents) load();
  }, [hasInitialEvents, load]);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (modal) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [modal]);

  function open(row = null) {
    setEditing(row);
    setValues(row ? eventView(row) : EMPTY);
    setFile(null);
    setFormError("");
    setModal(true);
  }

  async function save(event) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFormError("");
    try {
      let imageUrl = values.image_url;
      if (file) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
          throw new Error("Choose a JPG, PNG or WebP image under 5 MB.");
        }
        const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
        const path = "events/" + crypto.randomUUID() + "." + ext;
        const bucket = supabase.storage.from("EVENTS");
        const result = await bucket.upload(path, file, { upsert: false });
        if (result.error) {
          throw new Error("Image upload failed. Check the EVENTS bucket permissions or use an image URL.");
        }
        imageUrl = bucket.getPublicUrl(path).data.publicUrl;
        setValues((old) => ({ ...old, image_url: imageUrl }));
        setFile(null);
      }
      await saveEvent(supabase, { ...values, image_url: imageUrl }, editing, events[0]);
      setModal(false);
      setNotice(editing ? "Event updated in Supabase." : "Event added to Supabase.");
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function remove(row) {
    if (lock.current || !window.confirm("Delete “" + eventView(row).title + "”? This cannot be undone.")) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await deleteEvent(supabase, row.id);
      setNotice("Event deleted.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const filtered = events.filter((row) => {
    const event = eventView(row);
    return (
      (filter === "all" || event.status === filter) &&
      (event.title + " " + event.description).toLowerCase().includes(query.toLowerCase())
    );
  });

  const field = (name) => ({
    name,
    id: "event-" + name,
    value: values[name],
    onChange: (e) => setValues({ ...values, [name]: e.target.value }),
  });

  return (
    <div className="admin-tab-content">
      {/* View Header */}
      <div className="admin-view-header">
        <div>
          <p className="admin-eyebrow">EXPERIENCES & COMPETITIONS</p>
          <h1 className="admin-page-title">Events & hackathons</h1>
          <p className="admin-page-desc">
            Organize workshops, robotic tournaments, AI conferences, and student hackathons.
          </p>
        </div>
        <div className="admin-header-actions">
          <button className="btn-secondary" onClick={load} disabled={busy || loading}>
            Refresh
          </button>
          <button
            className="btn-primary"
            onClick={() => open()}
            disabled={busy || loading || Boolean(error)}
          >
            Add event ↗
          </button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert">{error}</div>}
      {notice && <div className="admin-inline-success" role="status">{notice}</div>}

      {/* Filter and Search Bar */}
      <div className="member-filters-bar">
        <div className="filter-pills-row">
          {["all", "Completed", "Upcoming"].map((status) => {
            const count = events.filter(
              (row) => status === "all" || eventView(row).status === status
            ).length;
            return (
              <button
                key={status}
                type="button"
                className={"filter-pill-btn " + (filter === status ? "is-active" : "")}
                onClick={() => setFilter(status)}
                aria-pressed={filter === status}
              >
                <span>{status === "all" ? "All events" : status}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ minWidth: "240px" }}>
          <input
            className="form-text-input"
            aria-label="Search events"
            placeholder="Search events, workshops…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ height: "34px", fontSize: "12px" }}
          />
        </div>
      </div>

      {/* Shimmer Skeletons or Events Grid */}
      {loading ? (
        <div className="admin-events-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="admin-event-card" style={{ height: "320px" }}>
              <div className="skeleton-shimmer" style={{ width: "100%", height: "160px" }} />
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                <div className="skeleton-shimmer skeleton-line" style={{ width: "30%", height: "10px" }} />
                <div className="skeleton-shimmer skeleton-line" style={{ width: "70%", height: "18px" }} />
                <div className="skeleton-shimmer skeleton-line" style={{ width: "90%", height: "12px" }} />
                <div className="skeleton-shimmer skeleton-line" style={{ width: "80%", height: "12px" }} />
                <div style={{ marginTop: "auto", display: "flex", gap: "8px" }}>
                  <div className="skeleton-shimmer skeleton-line" style={{ width: "80px", height: "32px", borderRadius: "8px" }} />
                  <div className="skeleton-shimmer skeleton-line" style={{ width: "80px", height: "32px", borderRadius: "8px" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-events-grid">
          {filtered.map((row) => {
            const event = eventView(row);
            const isCompleted = event.status === "Completed";
            return (
              <article className="admin-event-card" key={row.id}>
                <div className="admin-event-image">
                  <img
                    src={safeEventUrl(event.image_url, true) || "/events/workshop.png"}
                    alt={event.title}
                    loading="lazy"
                  />
                  <span className={`status-chip status-chip-${isCompleted ? "positive" : "warning"}`}>
                    <span className="status-chip-dot" />
                    <span>{event.status}</span>
                  </span>
                </div>

                <div className="admin-event-body">
                  <p className="admin-eyebrow" style={{ fontSize: "11px", marginBottom: "4px" }}>
                    {event.date || "Date not set"}
                  </p>
                  <h2>{event.title}</h2>
                  <p>{event.description || "A Robotics & AI Club experience."}</p>

                  <div className="admin-event-actions">
                    <button
                      className="btn-primary"
                      onClick={() => open(row)}
                      disabled={busy || Boolean(error)}
                      style={{ height: "32px", padding: "0 12px", fontSize: "12px" }}
                    >
                      Edit event
                    </button>
                    {safeEventUrl(event.link) && (
                      <a
                        className="btn-secondary"
                        href={event.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ height: "32px", padding: "0 12px", fontSize: "12px" }}
                      >
                        View ↗
                      </a>
                    )}
                    <button
                      className="btn-secondary btn-danger"
                      onClick={() => remove(row)}
                      disabled={busy || Boolean(error)}
                      aria-label={"Delete " + event.title}
                      style={{ height: "32px", padding: "0 12px", fontSize: "12px", marginLeft: "auto" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && !error && !filtered.length && (
        <div className="admin-panel admin-empty-state">
          {query || filter !== "all"
            ? "No events match these filters."
            : "No events yet. Add your first club event."}
        </div>
      )}

      {/* Modal Dialog */}
      <dialog
        ref={dialogRef}
        className="admin-event-dialog"
        aria-labelledby="event-editor-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setModal(false);
        }}
        onClose={() => setModal(false)}
      >
        {modal && (
          <form onSubmit={save}>
            <div className="admin-panel-header">
              <div>
                <p className="admin-eyebrow">EVENT EDITOR</p>
                <h2 id="event-editor-title" className="admin-panel-heading" style={{ fontSize: "18px" }}>
                  {editing ? "Edit experience" : "Create experience"}
                </h2>
              </div>
              <button
                className="btn-hairline-icon"
                type="button"
                aria-label="Close event editor"
                disabled={busy}
                onClick={() => setModal(false)}
              >
                &times;
              </button>
            </div>

            {formError && <div className="admin-inline-error" role="alert">{formError}</div>}

            <fieldset disabled={busy} className="admin-editor-fields">
              <div className="form-field-group">
                <label className="form-field-label" htmlFor="event-title">Event title</label>
                <input {...field("title")} className="form-text-input" required maxLength={180} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-field-group">
                  <label className="form-field-label" htmlFor="event-date">Date / Date range</label>
                  <input
                    {...field("date")}
                    className="form-text-input"
                    required
                    placeholder="13–14 June 2026"
                    maxLength={100}
                  />
                </div>
                <div className="form-field-group">
                  <label className="form-field-label" htmlFor="event-status">Status</label>
                  <select {...field("status")} className="form-select-input">
                    <option>Completed</option>
                    <option>Upcoming</option>
                  </select>
                </div>
              </div>

              <div className="form-field-group">
                <label className="form-field-label" htmlFor="event-link">Event link (optional)</label>
                <input
                  {...field("link")}
                  className="form-text-input"
                  type="url"
                  placeholder="https://…"
                />
              </div>

              <div className="form-field-group">
                <label className="form-field-label" htmlFor="event-description">Description</label>
                <textarea
                  {...field("description")}
                  className="form-textarea-input"
                  rows={3}
                  maxLength={4000}
                />
              </div>

              <div className="form-field-group">
                <label className="form-field-label" htmlFor="event-image_url">Image asset URL or path</label>
                <input {...field("image_url")} className="form-text-input" />
              </div>

              <div className="form-field-group">
                <label className="form-field-label" htmlFor="event-upload">
                  Or upload image (JPG, PNG, WebP · max 5 MB)
                </label>
                <input
                  id="event-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>

              <img
                className="admin-editor-preview"
                src={preview || safeEventUrl(values.image_url, true) || "/events/workshop.png"}
                alt="Event preview"
              />
            </fieldset>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setModal(false)}
              >
                Cancel
              </button>
              <button className="btn-primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create event"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
