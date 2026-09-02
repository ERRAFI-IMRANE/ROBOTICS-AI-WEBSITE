import React, { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import "./AdminDashboard.css";

const PRESET_IMAGES = [
  { label: "Workshop", url: "/events/workshop.png" },
  { label: "Hackathon", url: "/events/hackathon.png" },
  { label: "Competition", url: "/events/competition.png" },
  { label: "Expo", url: "/events/expo.png" },
  { label: "Summit", url: "/events/summit.png" },
  { label: "Drone Tech", url: "/events/drone.png" },
];

const INITIAL_FALLBACK_EVENTS = [
  {
    id: "evt-1",
    title: "National Robotics Hackathon 2025",
    date: "20-22 AVRIL 2025",
    image: "/events/hackathon.png",
    image_url: "/events/hackathon.png",
    link: "https://hackathon.robotics-ai-ests.ma",
    status: "Upcoming",
    description: "48-hour continuous hardware and embedded AI challenge at EST Safi campus.",
    data: {
      title: "National Robotics Hackathon 2025",
      date: "20-22 AVRIL 2025",
      image: "/events/hackathon.png",
      image_url: "/events/hackathon.png",
      link: "https://hackathon.robotics-ai-ests.ma",
      status: "Upcoming",
      description: "48-hour continuous hardware and embedded AI challenge at EST Safi campus.",
    },
    created_at: "2025-01-15T10:00:00Z",
  },
  {
    id: "evt-2",
    title: "Computer Vision & Embedded AI Workshop",
    date: "10-12 MARS 2025",
    image: "/events/workshop.png",
    image_url: "/events/workshop.png",
    link: "https://workshops.robotics-ai-ests.ma/cv-ai",
    status: "Upcoming",
    description: "Hands-on PyTorch deployment on Raspberry Pi and Jetson Nano.",
    data: {
      title: "Computer Vision & Embedded AI Workshop",
      date: "10-12 MARS 2025",
      image: "/events/workshop.png",
      image_url: "/events/workshop.png",
      link: "https://workshops.robotics-ai-ests.ma/cv-ai",
      status: "Upcoming",
      description: "Hands-on PyTorch deployment on Raspberry Pi and Jetson Nano.",
    },
    created_at: "2025-01-10T10:00:00Z",
  },
  {
    id: "evt-3",
    title: "Autonomous Drone Flight Simulation",
    date: "14-16 FEVRIER 2025",
    image: "/events/drone.png",
    image_url: "/events/drone.png",
    link: "https://workshops.robotics-ai-ests.ma/drones",
    status: "Completed",
    description: "ROS2 and PX4 autopilot integration for autonomous quadcopters.",
    data: {
      title: "Autonomous Drone Flight Simulation",
      date: "14-16 FEVRIER 2025",
      image: "/events/drone.png",
      image_url: "/events/drone.png",
      link: "https://workshops.robotics-ai-ests.ma/drones",
      status: "Completed",
      description: "ROS2 and PX4 autopilot integration for autonomous quadcopters.",
    },
    created_at: "2024-12-05T10:00:00Z",
  },
  {
    id: "evt-4",
    title: "Annual Robotics Expo & Innovation Summit",
    date: "18-20 DECEMBRE 2024",
    image: "/events/expo.png",
    image_url: "/events/expo.png",
    link: "https://expo.robotics-ai-ests.ma",
    status: "Completed",
    description: "Showcasing student robot builds to national industry partners.",
    data: {
      title: "Annual Robotics Expo & Innovation Summit",
      date: "18-20 DECEMBRE 2024",
      image: "/events/expo.png",
      image_url: "/events/expo.png",
      link: "https://expo.robotics-ai-ests.ma",
      status: "Completed",
      description: "Showcasing student robot builds to national industry partners.",
    },
    created_at: "2024-11-01T10:00:00Z",
  },
];

// Helper extractors with complete null and type safety
const extractEventData = (ev) => {
  if (!ev || typeof ev !== "object") return {};
  if (typeof ev.data === "string") {
    try {
      const parsed = JSON.parse(ev.data);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }
  if (ev.data && typeof ev.data === "object" && !Array.isArray(ev.data)) {
    return ev.data;
  }
  return {};
};

const getEventTitle = (ev) => {
  if (!ev || typeof ev !== "object") return "Untitled Event";
  const data = extractEventData(ev);
  const val = data.title ?? ev.title ?? data.name ?? ev.name;
  if (val === null || val === undefined) return "Untitled Event";
  if (typeof val === "object") return JSON.stringify(val);
  const str = String(val).trim();
  return str || "Untitled Event";
};

const getEventDate = (ev) => {
  if (!ev || typeof ev !== "object") return "";
  const data = extractEventData(ev);
  const val = data.date ?? ev.date ?? data.event_date ?? ev.event_date;
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return "";
  return String(val).trim();
};

const getEventImage = (ev) => {
  if (!ev || typeof ev !== "object") return PRESET_IMAGES[0].url;
  const data = extractEventData(ev);
  const val =
    ev.image_url ??
    data.image_url ??
    data.imageUrl ??
    ev.imageUrl ??
    data.image ??
    ev.image ??
    data.photo ??
    ev.photo ??
    data.banner ??
    ev.banner ??
    data.img ??
    ev.img;
  if (typeof val === "string" && val.trim()) return val.trim();
  return PRESET_IMAGES[0].url;
};

const getEventStatus = (ev) => {
  if (!ev || typeof ev !== "object") return "Upcoming";
  const data = extractEventData(ev);
  const val = data.status ?? ev.status;
  if (typeof val === "string" && val.trim()) {
    const norm = val.trim();
    if (norm.toLowerCase().includes("complete") || norm.toLowerCase().includes("past") || norm.toLowerCase().includes("finish")) {
      return "Completed";
    }
    return "Upcoming";
  }
  return "Upcoming";
};

const getEventLink = (ev) => {
  if (!ev || typeof ev !== "object") return "";
  const data = extractEventData(ev);
  const val = data.link ?? ev.link ?? data.url ?? ev.url;
  if (typeof val === "string") return val.trim();
  return "";
};

const getEventDescription = (ev) => {
  if (!ev || typeof ev !== "object") return "";
  const data = extractEventData(ev);
  const val = data.description ?? ev.description ?? data.desc ?? ev.desc;
  if (typeof val === "string") return val.trim();
  return "";
};

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [saving, setSaving] = useState(false);

  // Detail Inspection Modal State
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Add / Edit Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStatus, setFormStatus] = useState("Upcoming");
  const [formLink, setFormLink] = useState("");
  const [formDescription, setFormDescription] = useState("");

  // Image Upload State
  const fileInputRef = useRef(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");

  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadEventsData = async () => {
    try {
      setLoading(true);

      let { data, error } = await supabase
        .from("events")
        .select("*")
        .order("id", { ascending: false });

      if (error || !data || !Array.isArray(data) || data.length === 0) {
        try {
          const retryRes = await supabase.from("events").select("*");
          if (!retryRes.error && retryRes.data && Array.isArray(retryRes.data) && retryRes.data.length > 0) {
            data = retryRes.data;
          }
        } catch {
          // Retry failed, proceed to local/fallback
        }
      }

      if (data && Array.isArray(data) && data.length > 0) {
        const cleanList = data.filter((item) => item && typeof item === "object");
        if (cleanList.length > 0) {
          setEvents(cleanList);
          try {
            localStorage.setItem("rai_admin_events", JSON.stringify(cleanList));
          } catch {}
          return;
        }
      }

      // Check localStorage if Supabase returned no data
      const saved = localStorage.getItem("rai_admin_events");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEvents(parsed.filter((item) => item && typeof item === "object"));
            return;
          }
        } catch {
          // Bad JSON in localStorage, fall back
        }
      }

      setEvents(INITIAL_FALLBACK_EVENTS);
      try {
        localStorage.setItem("rai_admin_events", JSON.stringify(INITIAL_FALLBACK_EVENTS));
      } catch {}
    } catch (err) {
      console.warn("Could not fetch events from database:", err);
      try {
        const saved = localStorage.getItem("rai_admin_events");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEvents(parsed.filter((item) => item && typeof item === "object"));
            return;
          }
        }
      } catch {}
      setEvents(INITIAL_FALLBACK_EVENTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEventsData();
  }, []);

  const uploadImageToSupabase = async (file, folder = "events") => {
    if (!file) return null;

    try {
      const fileExt = file.name ? file.name.split(".").pop() || "jpg" : "jpg";
      const cleanName = (file.name || "upload").replace(/[^a-zA-Z0-9]/g, "_");
      const filePath = `${folder}/${Date.now()}_${cleanName}.${fileExt}`;

      const storageBuckets = ["EVENTS", "events", "images", "public"];
      let publicUrl = null;

      for (const bucket of storageBuckets) {
        try {
          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(filePath, file, { cacheControl: "3600", upsert: true });

          if (!uploadError) {
            const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
            if (data?.publicUrl) {
              publicUrl = data.publicUrl;
              break;
            }
          }
        } catch {
          // Try next bucket
        }
      }

      if (!publicUrl) {
        publicUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        });
      }

      return publicUrl;
    } catch {
      return null;
    }
  };

  const handleOpenAdd = () => {
    setEditingEvent(null);
    setFormTitle("");
    setFormDate("");
    setFormStatus("Upcoming");
    setFormLink("");
    setFormDescription("");

    setImageFile(null);
    setImagePreview(PRESET_IMAGES[0].url);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsModalOpen(true);
  };

  const handleOpenEdit = (evt) => {
    if (!evt) return;
    setEditingEvent(evt);
    setFormTitle(getEventTitle(evt));
    setFormDate(getEventDate(evt));
    setFormStatus(getEventStatus(evt));
    setFormLink(getEventLink(evt));
    setFormDescription(getEventDescription(evt));

    setImageFile(null);
    setImagePreview(getEventImage(evt));
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsModalOpen(true);
  };

  const handleOpenDetail = (evt) => {
    if (!evt) return;
    setSelectedEvent(evt);
    setIsDetailModalOpen(true);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      try {
        const previewUrl = URL.createObjectURL(file);
        setImagePreview(previewUrl);
      } catch {
        const reader = new FileReader();
        reader.onloadend = () => setImagePreview(reader.result);
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSelectPreset = (url) => {
    setImageFile(null);
    setImagePreview(url);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast("Please provide the event title.");
      return;
    }

    setSaving(true);
    showToast("Saving event record...");

    try {
      let finalImageUrl = imagePreview || PRESET_IMAGES[0].url;
      if (imageFile) {
        try {
          const uploadedUrl = await uploadImageToSupabase(imageFile, "events");
          if (uploadedUrl) {
            finalImageUrl = uploadedUrl;
          }
        } catch {
          // Fallback to preview url
        }
      }

      const eventData = {
        title: formTitle.trim(),
        date: formDate.trim(),
        image: finalImageUrl,
        image_url: finalImageUrl,
        link: formLink.trim(),
        status: formStatus,
        description: formDescription.trim(),
      };

      const fullPayload = {
        data: eventData,
        title: formTitle.trim(),
        date: formDate.trim(),
        image_url: finalImageUrl,
        image: finalImageUrl,
        status: formStatus,
        description: formDescription.trim(),
        link: formLink.trim(),
      };

      if (editingEvent) {
        let updatedRecord = null;

        try {
          if (editingEvent.id && typeof editingEvent.id !== "object" && !String(editingEvent.id).startsWith("evt-")) {
            // Attempt 1: Full payload
            const updateRes = await supabase
              .from("events")
              .update(fullPayload)
              .eq("id", editingEvent.id)
              .select();

            if (updateRes.data && updateRes.data[0]) {
              updatedRecord = updateRes.data[0];
            } else if (updateRes.error) {
              // Attempt 2: Only data column
              const updateRes2 = await supabase
                .from("events")
                .update({ data: eventData })
                .eq("id", editingEvent.id)
                .select();

              if (updateRes2.data && updateRes2.data[0]) {
                updatedRecord = updateRes2.data[0];
              } else {
                // Attempt 3: Flat columns without data
                const { data: _ignored, ...flatPayload } = fullPayload;
                const updateRes3 = await supabase
                  .from("events")
                  .update(flatPayload)
                  .eq("id", editingEvent.id)
                  .select();
                if (updateRes3.data && updateRes3.data[0]) {
                  updatedRecord = updateRes3.data[0];
                }
              }
            }
          }
        } catch (dbErr) {
          console.warn("Database update error:", dbErr);
        }

        if (!updatedRecord) {
          updatedRecord = {
            ...editingEvent,
            ...eventData,
            data: eventData,
          };
        }

        const currentList = Array.isArray(events) ? events : [];
        const updatedList = currentList.map((ev) =>
          ev?.id === editingEvent.id ? updatedRecord : ev
        );
        setEvents(updatedList);
        try {
          localStorage.setItem("rai_admin_events", JSON.stringify(updatedList));
        } catch {}
        showToast("Event specifications updated.");
      } else {
        let newRecord = null;

        try {
          // Attempt 1: Full payload
          const insertRes = await supabase
            .from("events")
            .insert([fullPayload])
            .select();

          if (insertRes.data && insertRes.data[0]) {
            newRecord = insertRes.data[0];
          } else if (insertRes.error) {
            // Attempt 2: Only data column
            const insertRes2 = await supabase
              .from("events")
              .insert([{ data: eventData }])
              .select();

            if (insertRes2.data && insertRes2.data[0]) {
              newRecord = insertRes2.data[0];
            } else {
              // Attempt 3: Flat columns without data
              const { data: _ignored, ...flatPayload } = fullPayload;
              const insertRes3 = await supabase
                .from("events")
                .insert([flatPayload])
                .select();
              if (insertRes3.data && insertRes3.data[0]) {
                newRecord = insertRes3.data[0];
              }
            }
          }
        } catch (dbErr) {
          console.warn("Database insert error:", dbErr);
        }

        if (!newRecord) {
          newRecord = {
            id: `evt-${Date.now()}`,
            data: eventData,
            ...eventData,
            created_at: new Date().toISOString(),
          };
        }

        const currentList = Array.isArray(events) ? events : [];
        const updatedList = [newRecord, ...currentList];
        setEvents(updatedList);
        try {
          localStorage.setItem("rai_admin_events", JSON.stringify(updatedList));
        } catch {}
        showToast("New event logged successfully.");
      }

      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving event:", err);
      showToast("Saved locally to dashboard storage.");
      setIsModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (id) => {
    if (!id) return;
    if (!window.confirm("Confirm deletion of this event record?")) return;
    try {
      if (typeof id !== "object" && !String(id).startsWith("evt-")) {
        await supabase.from("events").delete().eq("id", id);
      }
    } catch (err) {
      console.warn("Error deleting event from Supabase:", err);
    }
    const currentList = Array.isArray(events) ? events : [];
    const updated = currentList.filter((e) => e && e.id !== id);
    setEvents(updated);
    try {
      localStorage.setItem("rai_admin_events", JSON.stringify(updated));
    } catch {}
    showToast("Event record deleted.");
  };

  const safeEvents = useMemo(() => {
    return (Array.isArray(events) ? events : []).filter((item) => item && typeof item === "object");
  }, [events]);

  const filteredList = useMemo(() => {
    return safeEvents.filter((ev) => {
      if (!ev) return false;
      const title = getEventTitle(ev).toLowerCase();
      const desc = getEventDescription(ev).toLowerCase();
      const status = getEventStatus(ev);
      const query = String(searchQuery || "").toLowerCase().trim();
      const matchesSearch = !query || title.includes(query) || desc.includes(query);

      if (filterStatus === "all") return matchesSearch;
      return matchesSearch && status === filterStatus;
    });
  }, [safeEvents, searchQuery, filterStatus]);

  return (
    <div className="admin-tab-content">
      {/* Toast Notification */}
      {toastMsg && <div className="admin-toast-bar">{toastMsg}</div>}

      {/* Page Header */}
      <div className="admin-view-header">
        <div>
          <h1 className="admin-page-title">Events & competitions</h1>
          <p className="admin-page-desc">
            Club workshops, national hackathons, and technical expos.
          </p>
        </div>

        <div className="admin-header-actions">
          <button type="button" className="btn-primary" onClick={handleOpenAdd}>
            Add event
          </button>
        </div>
      </div>

      {/* Filter Bar: Status Pills + Search Input */}
      <div className="member-filters-bar">
        <div className="filter-pills-row">
          {["all", "Upcoming", "Completed"].map((st) => {
            const count = safeEvents.filter((ev) => {
              if (st === "all") return true;
              return getEventStatus(ev) === st;
            }).length;

            return (
              <button
                key={st}
                type="button"
                className={`filter-pill-btn ${filterStatus === st ? "is-active" : ""}`}
                onClick={() => setFilterStatus(st)}
              >
                <span>{st === "all" ? "All events" : st}</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    marginLeft: "4px",
                    color: "var(--text-muted)",
                  }}
                >
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ width: "240px" }}>
          <input
            type="text"
            placeholder="Search event, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-text-input"
            style={{ padding: "6px 10px", fontSize: "12px" }}
          />
        </div>
      </div>

      {/* Events Dedicated Card Grid */}
      {loading ? (
        <div
          className="admin-panel"
          style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}
        >
          <span>Connecting to database & loading event records...</span>
        </div>
      ) : filteredList.length === 0 ? (
        <div
          className="admin-panel"
          style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}
        >
          <p style={{ margin: "0 0 12px" }}>No event records match the filter.</p>
          <button type="button" className="btn-secondary" onClick={handleOpenAdd}>
            Add first event
          </button>
        </div>
      ) : (
        <div className="events-drafting-grid">
          {filteredList.map((ev, idx) => {
            const rawId = ev?.id;
            const eventKey = typeof rawId === "object" ? JSON.stringify(rawId) : (rawId || `evt-card-${idx}`);
            const title = getEventTitle(ev);
            const date = getEventDate(ev);
            const status = getEventStatus(ev);
            const isUpcoming = status === "Upcoming";
            const imgUrl = getEventImage(ev);
            const desc = getEventDescription(ev);
            const link = getEventLink(ev);

            return (
              <div
                key={eventKey}
                className="event-drafting-card"
                onClick={() => handleOpenDetail(ev)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpenDetail(ev);
                  }
                }}
              >
                {/* Event Cover Image Banner */}
                <div className="event-card-media-wrap">
                  <img
                    src={imgUrl}
                    alt={title}
                    className="event-card-img"
                    loading="lazy"
                    onError={(e) => {
                      e.target.src = PRESET_IMAGES[0].url;
                    }}
                  />
                  <div className="event-card-status-badge">
                    <span
                      className={`status-chip status-chip-${
                        isUpcoming ? "positive" : "neutral"
                      }`}
                    >
                      <span className="status-chip-dot" />
                      <span>{status}</span>
                    </span>
                  </div>
                </div>

                {/* Event Information Body */}
                <div className="event-card-body">
                  <span className="event-card-date-badge">{date || "Schedule TBD"}</span>
                  <h3 className="event-card-title">{title}</h3>
                  {desc && <p className="event-card-desc">{desc}</p>}
                </div>

                {/* Event Footer */}
                <div className="event-card-footer">
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="event-card-link-text"
                    >
                      <span>Registration link</span>
                    </a>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                      Internal event
                    </span>
                  )}

                  <div
                    className="member-card-quick-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="btn-hairline-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(ev);
                      }}
                      title="Edit event"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn-hairline-icon btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEvent(ev.id);
                      }}
                      title="Delete event"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event Details Inspection Modal */}
      {isDetailModalOpen && selectedEvent && (
        <div className="admin-modal-overlay" onClick={() => setIsDetailModalOpen(false)}>
          <div
            className="admin-modal-dialog"
            style={{ maxWidth: "560px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Event specifications</h2>
              <button
                type="button"
                className="admin-modal-close-btn"
                onClick={() => setIsDetailModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div className="admin-modal-body">
              {/* Event Hero Block */}
              <div className="profile-details-hero">
                <img
                  src={getEventImage(selectedEvent)}
                  alt={getEventTitle(selectedEvent)}
                  style={{
                    width: "96px",
                    height: "68px",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    objectFit: "cover",
                    background: "var(--bg)",
                  }}
                  onError={(e) => {
                    e.target.src = PRESET_IMAGES[0].url;
                  }}
                />
                <div className="profile-meta-block">
                  <h3 className="profile-fullname">{getEventTitle(selectedEvent)}</h3>
                  <div
                    className="profile-role-primary"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {getEventDate(selectedEvent) || "Date TBD"}
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    <span
                      className={`status-chip status-chip-${
                        getEventStatus(selectedEvent) === "Upcoming"
                          ? "positive"
                          : "neutral"
                      }`}
                    >
                      <span className="status-chip-dot" />
                      <span>{getEventStatus(selectedEvent)}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Event Description */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>
                  Event overview & scope
                </div>
                <p
                  style={{
                    fontSize: "13px",
                    lineHeight: "20px",
                    color: "var(--text)",
                    margin: 0,
                    padding: "10px 12px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                  }}
                >
                  {getEventDescription(selectedEvent) ||
                    "No additional technical description specified for this event."}
                </p>
              </div>

              {/* Registration Link */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>
                  Registration portal
                </div>
                {getEventLink(selectedEvent) ? (
                  <a
                    href={getEventLink(selectedEvent)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "13px", color: "var(--accent)" }}
                  >
                    {getEventLink(selectedEvent)}
                  </a>
                ) : (
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Internal club session &mdash; no external portal required.
                  </span>
                )}
              </div>

              {/* Record metadata */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingTop: "12px",
                  borderTop: "1px solid var(--border)",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}
              >
                <span>
                  Record ID:{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {typeof selectedEvent?.id === "object"
                      ? JSON.stringify(selectedEvent.id)
                      : String(selectedEvent?.id || "N/A")}
                  </span>
                </span>
                {selectedEvent?.created_at && (
                  <span>
                    Created:{" "}
                    {(() => {
                      try {
                        const d = new Date(selectedEvent.created_at);
                        return isNaN(d.getTime())
                          ? String(selectedEvent.created_at)
                          : d.toLocaleDateString();
                      } catch {
                        return "N/A";
                      }
                    })()}
                  </span>
                )}
              </div>
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={() => {
                  const id = selectedEvent.id;
                  setIsDetailModalOpen(false);
                  handleDeleteEvent(id);
                }}
              >
                Delete event
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsDetailModalOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const evt = selectedEvent;
                  setIsDetailModalOpen(false);
                  handleOpenEdit(evt);
                }}
              >
                Edit event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Event Form Modal */}
      {isModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="admin-modal-dialog" style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">
                {editingEvent ? "Edit event record" : "Log new event"}
              </h2>
              <button
                type="button"
                className="admin-modal-close-btn"
                onClick={() => setIsModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={handleSaveEvent}
              style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              <div className="admin-modal-body">
                {/* Event Title */}
                <div className="form-field-group">
                  <label className="form-field-label">Event title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. National Robotics Hackathon 2025"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="form-text-input"
                  />
                </div>

                {/* Event Picture Import Slot */}
                <div className="form-field-group">
                  <label className="form-field-label">Event picture & imagery</label>
                  <div className="image-import-slot">
                    <div className="image-import-content">
                      <div
                        className="image-import-preview-box"
                        style={{ width: "72px", height: "52px" }}
                      >
                        {imagePreview ? (
                          <img
                            src={imagePreview}
                            alt="Event preview"
                            className="image-import-preview-img"
                            onError={(e) => {
                              e.target.src = PRESET_IMAGES[0].url;
                            }}
                          />
                        ) : (
                          <div className="image-import-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </div>
                        )}
                      </div>

                      <div className="image-import-controls">
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/*"
                          onChange={handleFileChange}
                          style={{ display: "none" }}
                        />
                        <button
                          type="button"
                          className="image-import-action-btn"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          <span>{imageFile ? "Replace file" : "Import picture"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Quick Preset Badges */}
                    <div style={{ marginTop: "6px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Or select standard event preset:
                      </span>
                      <div className="event-preset-pills-row">
                        {PRESET_IMAGES.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            className={`event-preset-pill ${
                              imagePreview === preset.url && !imageFile ? "is-active" : ""
                            }`}
                            onClick={() => handleSelectPreset(preset.url)}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Date & Status */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-field-group">
                    <label className="form-field-label">Schedule date *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 20-22 Avril 2025"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="form-text-input"
                    />
                  </div>

                  <div className="form-field-group">
                    <label className="form-field-label">Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value)}
                      className="form-select-input"
                    >
                      <option value="Upcoming">Upcoming</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>

                {/* Registration Link */}
                <div className="form-field-group">
                  <label className="form-field-label">Registration / external link</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={formLink}
                    onChange={(e) => setFormLink(e.target.value)}
                    className="form-text-input"
                  />
                </div>

                {/* Description */}
                <div className="form-field-group">
                  <label className="form-field-label">Event description</label>
                  <textarea
                    rows={3}
                    placeholder="Summary of technical scope, track details, or prerequisites..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="form-textarea"
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving record..." : editingEvent ? "Save changes" : "Log event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
