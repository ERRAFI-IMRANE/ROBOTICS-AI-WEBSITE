import { useEffect, useState } from "react";
import { publicContent, supabase } from "../lib/supabaseClient";
import { eventView, parseEventDate as parseStoredEventDate, safeEventUrl } from "../lib/adminEvents";
import { withRequestTimeout } from "../lib/requestTimeout";

export interface EventRow {
  id: string | number;
  title: string | null;
  date: string | null;
  image_url: string | null;
  link: string | null;
  created_at: string | null;
}

interface EventsListProps {
  onLoaded?: () => void;
  initialEvents?: EventRow[] | null;
}

const DEFAULT_EVENTS: EventRow[] = [
  { id: "def-1", title: "National AI & Innovation Summit", date: "15 Feb 2025", image_url: "/events/summit.png", link: "https://ests.uca.ma", created_at: null },
  { id: "def-2", title: "Autonomous Robotics Workshop", date: "13-14 Oct 2024", image_url: "/events/workshop.png", link: "https://ests.uca.ma", created_at: null },
  { id: "def-3", title: "National AI Hackathon EST Safi", date: "18-19 Nov 2024", image_url: "/events/hackathon.png", link: "https://ests.uca.ma", created_at: null },
  { id: "def-4", title: "Moroccan Robotics Challenge", date: "08-09 Dec 2024", image_url: "/events/competition.png", link: "https://ests.uca.ma", created_at: null },
  { id: "def-5", title: "ROS2 Drone & PX4 Flight Testing", date: "20 Jan 2025", image_url: "/events/drone.png", link: "https://ests.uca.ma", created_at: null },
  { id: "def-6", title: "Engineering Tech Expo", date: "12 Mar 2025", image_url: "/events/expo.png", link: "https://ests.uca.ma", created_at: null },
];

const CARD_SIZES = ["medium", "small", "large", "medium", "small"];
const OFFSETS = ["15px", "-15px", "20px", "-10px", "10px", "-20px"];
const EVENT_COLUMNS = "id,title,date,image_url,link,created_at";

function parseEventDate(item: EventRow): number {
  const parsed = parseStoredEventDate(item);
  if (parsed) return parsed.getTime();
  const created = item.created_at ? new Date(item.created_at) : null;
  return created && !Number.isNaN(created.getTime()) ? created.getTime() : 0;
}

function getEventLink(item: EventRow): string {
  return safeEventUrl(item?.link || "");
}

function normalizeEvents(rows: EventRow[] | null | undefined): EventRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return DEFAULT_EVENTS;
  return rows
    .map((row) => {
      const event = eventView(row);
      return {
        id: row.id,
        title: event.title,
        date: event.date,
        image_url: safeEventUrl(event.image_url, true) || "/events/workshop.png",
        link: event.link,
        created_at: event.created_at,
      };
    })
    .sort((a, b) => parseEventDate(b) - parseEventDate(a));
}

export default function EventsList({ onLoaded, initialEvents = null }: EventsListProps) {
  const hasInitialEvents = Array.isArray(initialEvents);
  const [events, setEvents] = useState<EventRow[]>(() => hasInitialEvents ? normalizeEvents(initialEvents) : []);
  const [loading, setLoading] = useState<boolean>(!hasInitialEvents);

  useEffect(() => {
    if (hasInitialEvents) {
      setEvents(normalizeEvents(initialEvents));
      setLoading(false);
      const loadedTimer = window.setTimeout(() => onLoaded?.(), 50);
      return () => window.clearTimeout(loadedTimer);
    }

    async function fetchEvents() {
      try {
        setLoading(true);
        const client = publicContent || supabase;
        let data: EventRow[] | null = null;
        let fetchError: unknown = null;
        try {
          const result = await withRequestTimeout(
            client.from("events").select(EVENT_COLUMNS).order("id", { ascending: false }),
            "Public events",
            6000,
          );
          data = result.data as EventRow[] | null;
          fetchError = result.error;
        } catch (error) {
          fetchError = error;
        }

        if (fetchError || !data?.length) {
          const fallback = await supabase.from("events").select(EVENT_COLUMNS).order("id", { ascending: false });
          if (!fallback.error && fallback.data?.length) data = fallback.data as EventRow[];
        }
        setEvents(normalizeEvents(data));
      } catch (error) {
        console.warn("Error fetching events from Supabase, using defaults:", error);
        setEvents(DEFAULT_EVENTS);
      } finally {
        setLoading(false);
        window.setTimeout(() => onLoaded?.(), 50);
      }
    }

    fetchEvents();
  }, [hasInitialEvents, initialEvents, onLoaded]);

  if (loading) {
    return <div className="events-loading" style={{ padding: "40px", color: "#94a3b8", fontSize: "15px" }}>Loading events...</div>;
  }
  if (!events.length) {
    return <div className="events-empty" style={{ padding: "40px", color: "#94a3b8", fontSize: "15px" }}>No events found.</div>;
  }

  return (
    <>
      {events.map((item, index) => {
        const title = item.title || "UNTITLED EVENT";
        const date = item.date || "";
        const image = item.image_url || "/events/summit.png";
        const eventLink = getEventLink(item);
        const isExternal = /^https?:\/\//i.test(eventLink);
        const size = CARD_SIZES[index % CARD_SIZES.length];
        const offsetY = OFFSETS[index % OFFSETS.length];
        const isImgTop = parseInt(offsetY, 10) < 0;

        return (
          <div
            key={item.id || index}
            className={`event-card-wrapper size-${size} ${isImgTop ? "img-top" : "img-bottom"}`}
            style={{ transform: `translateY(${offsetY})` }}
          >
            <a
              href={eventLink || "#events"}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              className="event-card-link"
              aria-label={`View details for ${title}`}
              onClick={(event) => { if (!eventLink) event.preventDefault(); }}
            >
              <div className="event-image-container">
                <img
                  src={image}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                  className="event-img"
                  onError={(event) => {
                    const imageElement = event.currentTarget;
                    if (imageElement.dataset.fallback) return;
                    imageElement.dataset.fallback = "true";
                    imageElement.src = "/events/summit.png";
                  }}
                />
                <div className="event-img-overlay" />
              </div>
              <div className="event-card-text">
                {date && <div className="event-meta"><span className="event-date">{date}</span></div>}
                <div className="event-card-info">
                  <h3 className="event-card-title"><span className="event-title-char">{title}</span></h3>
                  <span className="event-link-arrow">↗</span>
                </div>
              </div>
            </a>
          </div>
        );
      })}
    </>
  );
}
