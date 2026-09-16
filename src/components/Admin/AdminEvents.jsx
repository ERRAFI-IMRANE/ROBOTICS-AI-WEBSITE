import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, publicContent } from "../../lib/supabaseClient";
import { withRequestTimeout } from "../../lib/requestTimeout";
import { deleteEvent, eventPayload, eventView, formatDateForInput, safeEventUrl, saveEvent } from "../../lib/adminEvents";
import { deleteMediaUrl, uploadMedia, validateImageFile } from "../../lib/mediaStorage";
import { AdminConfirmDialog, AdminToast } from "./AdminActionFeedback";
import { useAdminToast } from "./useAdminToast";
import "./AdminDashboard.css";

const PAGE_SIZE = 12;
const EVENT_COLUMNS = "id,title,date,image_url,link,created_at";
const FALLBACK_IMAGE = "/events/workshop.png";
const EMPTY = { title: "", date: "", image_url: "", link: "" };

const EventRow = React.memo(function EventRow({ record, busy, onEdit, onDelete, onView }) {
  const { row, event, imageUrl, linkUrl } = record;
  return (
    <article className="admin-event-row">
      <div className="admin-event-row-image">
        <img src={imageUrl} alt="" loading="lazy" decoding="async" fetchPriority="low" draggable="false" width="176" height="108" />
      </div>
      <div className="admin-event-row-copy">
        <div className="admin-event-row-meta"><time>{event.date || "Date not set"}</time></div>
        <h2>{event.title || "Untitled event"}</h2>
        <p>{linkUrl ? "Published with an event link" : "Published club event"}</p>
      </div>
      <div className="admin-event-row-actions">
        <button type="button" className="btn-primary" onClick={() => onEdit(row)} disabled={busy}>Edit</button>
        {linkUrl ? <a className="btn-secondary" href={linkUrl} target="_blank" rel="noopener noreferrer">View</a>
          : <button type="button" className="btn-secondary" onClick={() => onView(record)} disabled={busy} aria-label={`View ${event.title || "event"}`}>View</button>}
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
  const [confirmation, setConfirmation] = useState(null);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [legacyDate, setLegacyDate] = useState("");
  const [modal, setModal] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const lock = useRef(false);
  const dialogRef = useRef(null);
  const viewDialogRef = useRef(null);
  const loadMoreRef = useRef(null);
  const { toast, showToast, clearToast } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await withRequestTimeout(
        publicContent.from("events").select(EVENT_COLUMNS).order("id", { ascending: false }),
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

  useEffect(() => { if (!hasInitialEvents) load(); }, [hasInitialEvents, load]);

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

  useEffect(() => {
    const dialog = viewDialogRef.current;
    if (viewing && !dialog?.open) dialog?.showModal();
    if (!viewing && dialog?.open) dialog.close();
  }, [viewing]);

  useEffect(() => setVisibleCount(PAGE_SIZE), [query]);

  const records = useMemo(() => events.map((row) => {
    const event = eventView(row);
    return {
      row,
      event,
      searchText: `${event.title} ${event.date}`.toLowerCase(),
      imageUrl: safeEventUrl(event.image_url, true) || FALLBACK_IMAGE,
      linkUrl: safeEventUrl(event.link),
    };
  }), [events]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? records.filter((record) => record.searchText.includes(needle)) : records;
  }, [query, records]);
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
      if (entries[0]?.isIntersecting) setVisibleCount((count) => Math.min(count + PAGE_SIZE, filtered.length));
    }, { root: scrollRoot, rootMargin: "280px 0px", threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount]);

  const open = useCallback((row = null) => {
    const view = row ? eventView(row) : { ...EMPTY };
    const inputDate = formatDateForInput(view.date);
    setEditing(row);
    setLegacyDate(row && view.date && !inputDate ? view.date : "");
    setValues({ title: view.title, date: inputDate, image_url: view.image_url, link: view.link });
    setFile(null);
    setFormError("");
    setModal(true);
  }, []);

  function closeEditor() {
    if (!busy) setModal(false);
  }

  async function performSave() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFormError("");
    setError("");
    let uploadedUrl = "";
    let databaseSaved = false;
    try {
      if (!editing && !file) throw new Error("Choose an event cover image.");
      eventPayload({ ...values, image_url: file ? "/pending-r2-upload" : values.image_url });
      let imageUrl = values.image_url;
      if (file) {
        validateImageFile(file);
        const uploaded = await uploadMedia(supabase, file, "EVENTS");
        uploadedUrl = uploaded.url;
        imageUrl = uploaded.url;
      }

      await saveEvent(supabase, { ...values, image_url: imageUrl }, editing);
      databaseSaved = true;
      const oldImageUrl = eventView(editing || {}).image_url;
      if (uploadedUrl && oldImageUrl && oldImageUrl !== uploadedUrl) {
        await deleteMediaUrl(supabase, oldImageUrl);
      }

      setModal(false);
      setFile(null);
      await load();
      showToast(editing ? "Event details and media updated." : "Event created successfully.");
    } catch (saveError) {
      if (uploadedUrl && !databaseSaved) {
        try {
          await deleteMediaUrl(supabase, uploadedUrl);
        } catch (cleanupError) {
          const message = `${saveError.message || "The event could not be saved."} The new R2 upload also needs manual cleanup: ${cleanupError.message}`;
          setFormError(message);
          showToast(message, "error");
          return;
        }
      }
      if (databaseSaved) {
        setModal(false);
        await load();
        showToast(`The event was saved, but its old R2 image could not be cleaned up: ${saveError.message}`, "error");
      } else {
        const message = saveError.message || "The event could not be saved.";
        setFormError(message);
        showToast(message, "error");
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function requestSave(submitEvent) {
    submitEvent.preventDefault();
    if (lock.current || busy) return;
    try {
      if (!editing && !file) throw new Error("Choose an event cover image.");
      eventPayload({ ...values, image_url: file ? "/pending-r2-upload" : values.image_url });
      if (file) validateImageFile(file);
      setFormError("");
      setConfirmation({
        title: editing ? "Save event changes?" : "Create this event?",
        message: editing
          ? `Update “${values.title.trim()}” and publish the changes to the website?`
          : `Add “${values.title.trim()}” to the event archive and publish it on the website?`,
        confirmLabel: editing ? "Save changes" : "Create event",
        action: performSave,
      });
    } catch (validationError) {
      const message = validationError.message || "Check the event details before continuing.";
      setFormError(message);
      showToast(message, "error");
    }
  }

  const performRemove = useCallback(async (row) => {
    const view = eventView(row);
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await deleteEvent(supabase, row.id);
      let cleanupMessage = "";
      let imageDeleted = false;
      try {
        const cleanup = await deleteMediaUrl(supabase, view.image_url);
        imageDeleted = cleanup.deleted === true;
      } catch (cleanupError) {
        cleanupMessage = cleanupError.message;
      }
      await load();
      if (cleanupMessage) showToast(`The event was deleted, but its R2 image could not be removed: ${cleanupMessage}`, "error");
      else showToast(imageDeleted ? "Event and its managed R2 image were deleted." : "Event deleted. External or legacy media was left untouched.");
    } catch (deleteError) {
      showToast(deleteError.message || "The event could not be deleted.", "error");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [load, showToast]);

  const remove = useCallback((row) => {
    if (lock.current || busy) return;
    const view = eventView(row);
    setConfirmation({
      title: "Delete this event?",
      message: `“${view.title || "This event"}” and its managed cover image will be permanently deleted. This action cannot be undone.`,
      confirmLabel: "Delete event",
      tone: "danger",
      action: () => performRemove(row),
    });
  }, [busy, performRemove]);

  const runConfirmedAction = async () => {
    const action = confirmation?.action;
    if (!action) return;
    setConfirmation(null);
    await action();
  };

  const field = (name) => ({
    name,
    id: `event-${name}`,
    value: values[name],
    onChange: (event) => setValues((current) => ({ ...current, [name]: event.target.value })),
  });

  return (
    <div className="admin-tab-content admin-event-manager">
      <AdminToast toast={toast} onClose={clearToast} />

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

      <div className="member-filters-bar admin-event-toolbar">
        <div className="filter-pills-row">
          <span className="filter-pill-btn is-active"><span>All events</span><span className="admin-filter-count">{records.length}</span></span>
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
          <EventRow key={record.row.id} record={record} busy={busy} onEdit={open} onDelete={remove} onView={setViewing} />
        ))}
        {!loading && !error && !filtered.length && (
          <div className="admin-empty-state">{query ? "No events match your search." : "No events yet. Add your first club event."}</div>
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
          <form className="admin-event-editor-form" onSubmit={requestSave}>
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
                  <label className="form-field-group" htmlFor="event-date">
                    <span className="form-field-label">Event date</span>
                    <input {...field("date")} className="form-text-input" type="date" required />
                    {legacyDate && <small>Previously stored date: {legacyDate}. Choose one date to normalize this event.</small>}
                  </label>
                  <label className="form-field-group" htmlFor="event-link"><span className="form-field-label">Event link <em>Optional</em></span><input {...field("link")} className="form-text-input" type="url" placeholder="https://example.com/event" /></label>
                </section>

                <aside className="admin-event-editor-section admin-event-media-editor">
                  <div className="admin-event-editor-section-head"><strong>Cover image</strong><span>JPG, PNG, or WebP. Maximum 5 MB.</span></div>
                  <div className="admin-event-preview-frame"><img className="admin-editor-preview" src={preview || safeEventUrl(values.image_url, true) || FALLBACK_IMAGE} alt="Event cover preview" /></div>
                  <label className="admin-event-upload-control" htmlFor="event-upload"><strong>{file ? file.name : editing ? "Replace image" : "Choose an image"}</strong><span>{file ? "Select another file" : "Upload securely to Cloudflare R2"}</span></label>
                  <input className="admin-event-file-input" id="event-upload" type="file" accept="image/jpeg,image/png,image/webp" required={!editing} onChange={(event) => setFile(event.target.files?.[0] || null)} />
                  {editing && !file && <p className="admin-event-media-note">The current image remains unchanged until you select a replacement.</p>}
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

      <dialog ref={viewDialogRef} className="admin-event-dialog admin-event-view-dialog" aria-labelledby="event-view-title" onCancel={() => setViewing(null)} onClose={() => setViewing(null)}>
        {viewing && <>
          <header className="admin-modal-header"><div><h2 id="event-view-title" className="admin-modal-title">{viewing.event.title || "Untitled event"}</h2><p>{viewing.event.date || "Date not set"}</p></div><button type="button" className="admin-modal-close-btn" aria-label="Close event preview" onClick={() => setViewing(null)}>×</button></header>
          <div className="admin-event-view-body"><img src={viewing.imageUrl} alt={viewing.event.title || "Event cover"} decoding="async" /><p>No external event link has been added. You can still view this event’s cover and details here.</p></div>
          <footer className="admin-modal-footer"><button type="button" className="btn-secondary" onClick={() => setViewing(null)}>Close preview</button></footer>
        </>}
      </dialog>

      <AdminConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={runConfirmedAction}
      />
    </div>
  );
}
