import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, publicContent } from "../../lib/supabaseClient";
import { withRequestTimeout } from "../../lib/requestTimeout";
import { deleteEvent, eventView, safeEventUrl, saveEvent } from "../../lib/adminEvents";
import "./AdminDashboard.css";

const PAGE_SIZE = 12;
const FALLBACK_IMAGE = "/events/workshop.png";
const EMPTY = {
  title: "",
  date: "",
  image_url: FALLBACK_IMAGE,
  link: "",
  description: "",
  status: "Upcoming",
};

const EventRow = React.memo(function EventRow({ record, busy, onEdit, onDelete }) {
  const { row, event, imageUrl, linkUrl } = record;
  const isCompleted = event.status === "Completed";

  return (
    <article className="admin-event-row">
      <div className="admin-event-row-image">
        <img src={imageUrl} alt="" loading="lazy" decoding="async" fetchPriority="low" draggable="false" width="176" height="108" />
      </div>
      <div className="admin-event-row-copy">
        <div className="admin-event-row-meta">
          <span className={`status-chip status-chip-${isCompleted ? "positive" : "warning"}`}>
            <span className="status-chip-dot" />
            <span>{event.status}</span>
          </span>
          <time>{event.date || "Date not set"}</time>
        </div>
        <h2>{event.title || "Untitled event"}</h2>
        <p>{event.description || "A Robotics & AI Club experience."}</p>
      </div>
      <div className="admin-event-row-actions">
        <button type="button" className="btn-primary" onClick={() => onEdit(row)} disabled={busy}>Edit</button>
        {linkUrl && <a className="btn-secondary" href={linkUrl} target="_blank" rel="noopener noreferrer">View</a>}
        <button type="button" className="btn-secondary btn-danger" onClick={() => onDelete(row)} disabled={busy} aria-label={`Delete ${event.title}`}>Delete</button>
      </div>
    </article>
  );
});

export default function AdminEvents({ initialEvents = null, onDataChange = () => {} }) {
  const hasInitialEvents = Array.isArray(initialEvents);
  const [events, setEvents] = useState(hasInitialEvents ? initialEvents : []);
  const [loading, setLoading] = useState(!hasInitialEvents);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState(null);
  const [modal, setModal] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const lock = useRef(false);
  const dialogRef = useRef(null);
  const loadMoreRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await withRequestTimeout(
        publicContent.from("events").select("*").order("id", { ascending: false }),
        "Loading events",
      );
      if (result.error) throw result.error;
      const rows = result.data || [];
      setEvents(rows);
      onDataChange(rows);
    } catch (loadError) {
      setError(loadError.message || "Could not load events.");
    } finally {
      setLoading(false);
    }
  }, [onDataChange]);

  useEffect(() => {
    if (!hasInitialEvents) load();
  }, [hasInitialEvents, load]);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (modal && !dialogRef.current?.open) dialogRef.current?.showModal();
    if (!modal && dialogRef.current?.open) dialogRef.current.close();
  }, [modal]);

  useEffect(() => setVisibleCount(PAGE_SIZE), [filter, query]);

  const records = useMemo(() => events.map((row) => {
    const event = eventView(row);
    return {
      row,
      event,
      searchText: `${event.title} ${event.description} ${event.date}`.toLowerCase(),
      imageUrl: safeEventUrl(event.image_url, true) || FALLBACK_IMAGE,
      linkUrl: safeEventUrl(event.link),
    };
  }), [events]);

  const counts = useMemo(() => records.reduce((result, record) => {
    result.all += 1;
    if (record.event.status === "Completed") result.Completed += 1;
    if (record.event.status === "Upcoming") result.Upcoming += 1;
    return result;
  }, { all: 0, Completed: 0, Upcoming: 0 }), [records]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => (
      (filter === "all" || record.event.status === filter)
      && (!needle || record.searchText.includes(needle))
    ));
  }, [filter, query, records]);

  const visibleEvents = filtered.slice(0, visibleCount);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || visibleCount >= filtered.length) return undefined;
    if (!("IntersectionObserver" in window)) {
      setVisibleCount(filtered.length);
      return undefined;
    }
    const scrollRoot = sentinel.closest(".admin-main-viewport");
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      setVisibleCount((count) => Math.min(count + PAGE_SIZE, filtered.length));
    }, { root: scrollRoot, rootMargin: "280px 0px", threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount]);

  const open = useCallback((row = null) => {
    setEditing(row);
    setValues(row ? eventView(row) : { ...EMPTY });
    setFile(null);
    setFormError("");
    setNotice("");
    setModal(true);
  }, []);

  function closeEditor() {
    if (!busy) setModal(false);
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
        const path = `events/${crypto.randomUUID()}.${ext}`;
        const bucket = supabase.storage.from("EVENTS");
        const result = await bucket.upload(path, file, { upsert: false });
        if (result.error) throw new Error("Image upload failed. Check the EVENTS bucket permissions or use an image URL.");
        imageUrl = bucket.getPublicUrl(path).data.publicUrl;
      }
      await saveEvent(supabase, { ...values, image_url: imageUrl }, editing, events[0]);
      setModal(false);
      setFile(null);
      setNotice(editing ? "Event updated in Supabase." : "Event added to Supabase.");
      await load();
    } catch (saveError) {
      setFormError(saveError.message || "The event could not be saved.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const remove = useCallback(async (row) => {
    const title = eventView(row).title || "this event";
    if (lock.current || !window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await deleteEvent(supabase, row.id);
      setNotice("Event deleted.");
      await load();
    } catch (deleteError) {
      setError(deleteError.message || "The event could not be deleted.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [load]);

  const field = (name) => ({
    name,
    id: `event-${name}`,
    value: values[name],
    onChange: (event) => setValues((current) => ({ ...current, [name]: event.target.value })),
  });

  return (
    <div className="admin-tab-content admin-event-manager">
      <div className="admin-view-header">
        <div>
          <p className="admin-eyebrow">Experiences and competitions</p>
          <h1 className="admin-page-title">Events &amp; hackathons</h1>
          <p className="admin-page-desc">Manage workshops, competitions, conferences, and club experiences.</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="btn-secondary" onClick={load} disabled={busy || loading}>Refresh</button>
          <button type="button" className="btn-primary" onClick={() => open()} disabled={busy || loading || Boolean(error)}>Add event</button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert">{error}</div>}
      {notice && <div className="admin-inline-success" role="status">{notice}</div>}

      <div className="member-filters-bar admin-event-toolbar">
        <div className="filter-pills-row">
          {["all", "Completed", "Upcoming"].map((status) => (
            <button key={status} type="button" className={`filter-pill-btn ${filter === status ? "is-active" : ""}`} onClick={() => setFilter(status)} aria-pressed={filter === status}>
              <span>{status === "all" ? "All events" : status}</span>
              <span className="admin-filter-count">{counts[status]}</span>
            </button>
          ))}
        </div>
        <input className="form-text-input admin-event-search" type="search" aria-label="Search events" placeholder="Search events or dates" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      <div className="admin-events-performance" aria-busy={loading}>
        {loading && [1, 2, 3, 4].map((item) => (
          <div className="admin-event-row admin-event-row-skeleton" key={item}>
            <span className="skeleton-shimmer" />
            <span><i className="skeleton-shimmer" /><i className="skeleton-shimmer" /><i className="skeleton-shimmer" /></span>
          </div>
        ))}

        {!loading && visibleEvents.map((record) => (
          <EventRow key={record.row.id} record={record} busy={busy} onEdit={open} onDelete={remove} />
        ))}

        {!loading && !error && !filtered.length && (
          <div className="admin-empty-state">
            {query || filter !== "all" ? "No events match these filters." : "No events yet. Add your first club event."}
          </div>
        )}
      </div>

      {!loading && visibleCount < filtered.length && <div ref={loadMoreRef} className="admin-events-scroll-sentinel" aria-hidden="true"><span /></div>}

      <dialog
        ref={dialogRef}
        className="admin-event-dialog admin-event-editor-dialog"
        aria-labelledby="event-editor-title"
        onCancel={(event) => { if (busy) event.preventDefault(); else setModal(false); }}
        onClose={() => setModal(false)}
      >
        {modal && (
          <form className="admin-event-editor-form" onSubmit={save}>
            <header className="admin-event-editor-header">
              <div>
                <span>{editing ? "Update event" : "New event"}</span>
                <h2 id="event-editor-title">{editing ? "Edit event details" : "Create a club event"}</h2>
              </div>
              <button className="admin-modal-close-btn" type="button" aria-label="Close event editor" disabled={busy} onClick={closeEditor}>×</button>
            </header>

            <div className="admin-event-editor-body">
              {formError && <div className="admin-inline-error" role="alert">{formError}</div>}
              <fieldset disabled={busy} className="admin-event-editor-grid">
                <section className="admin-event-editor-section">
                  <div className="admin-event-editor-section-head"><strong>Event details</strong><span>Information shown on the public website.</span></div>
                  <label className="form-field-group" htmlFor="event-title"><span className="form-field-label">Event title</span><input {...field("title")} className="form-text-input" required maxLength={180} placeholder="Robotics workshop" /></label>
                  <div className="admin-event-editor-pair">
                    <label className="form-field-group" htmlFor="event-date"><span className="form-field-label">Date or date range</span><input {...field("date")} className="form-text-input" required placeholder="13–14 June 2026" maxLength={100} /></label>
                    <label className="form-field-group" htmlFor="event-status"><span className="form-field-label">Status</span><select {...field("status")} className="form-select-input"><option>Upcoming</option><option>Completed</option></select></label>
                  </div>
                  <label className="form-field-group" htmlFor="event-link"><span className="form-field-label">Event link <em>Optional</em></span><input {...field("link")} className="form-text-input" type="url" placeholder="https://example.com/event" /></label>
                  <label className="form-field-group" htmlFor="event-description"><span className="form-field-label">Description</span><textarea {...field("description")} className="form-textarea-input" rows={6} maxLength={4000} placeholder="Describe the event, audience, and main activities." /></label>
                </section>

                <aside className="admin-event-editor-section admin-event-media-editor">
                  <div className="admin-event-editor-section-head"><strong>Cover image</strong><span>JPG, PNG, or WebP. Maximum 5 MB.</span></div>
                  <div className="admin-event-preview-frame"><img className="admin-editor-preview" src={preview || safeEventUrl(values.image_url, true) || FALLBACK_IMAGE} alt="Event cover preview" /></div>
                  <label className="admin-event-upload-control" htmlFor="event-upload"><strong>{file ? file.name : "Choose an image"}</strong><span>{file ? "Select another file" : "Upload from this computer"}</span></label>
                  <input className="admin-event-file-input" id="event-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                  <div className="admin-event-media-divider"><span>or use a URL</span></div>
                  <label className="form-field-group" htmlFor="event-image_url"><span className="form-field-label">Image URL or asset path</span><input {...field("image_url")} className="form-text-input" placeholder="/events/workshop.png" /></label>
                </aside>
              </fieldset>
            </div>

            <footer className="admin-event-editor-footer">
              <span>{busy ? "Saving event and media…" : "Changes appear after saving."}</span>
              <div><button type="button" className="btn-secondary" disabled={busy} onClick={closeEditor}>Cancel</button><button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create event"}</button></div>
            </footer>
          </form>
        )}
      </dialog>
    </div>
  );
}
