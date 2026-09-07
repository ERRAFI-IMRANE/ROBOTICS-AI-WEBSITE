import { useEffect, useState } from "react";
import { publicContent, supabase } from "../lib/supabaseClient";
import { eventView, safeEventUrl } from "../lib/adminEvents";
import { withRequestTimeout } from "../lib/requestTimeout";

export interface EventRow {
  id: string | number;
  data?: {
    title?: string;
    date?: string;
    image?: string;
    image_url?: string;
    link?: string;
    links?: string;
    url?: string;
    [key: string]: any;
  } | null;
  title?: string;
  date?: string;
  image?: string;
  image_url?: string | null;
  link?: string;
  links?: string;
  url?: string;
  created_at?: string;
  [key: string]: any;
}

interface EventsListProps {
  onLoaded?: () => void;
}

const DEFAULT_EVENTS: EventRow[] = [
  {
    id: "def-1",
    title: "National AI & Innovation Summit",
    date: "15 Feb 2025",
    image_url: "/events/summit.png",
    link: "https://ests.uca.ma",
    status: "Completed",
  },
  {
    id: "def-2",
    title: "Autonomous Robotics Workshop",
    date: "13-14 Oct 2024",
    image_url: "/events/workshop.png",
    link: "https://ests.uca.ma",
    status: "Completed",
  },
  {
    id: "def-3",
    title: "National AI Hackathon EST Safi",
    date: "18-19 Nov 2024",
    image_url: "/events/hackathon.png",
    link: "https://ests.uca.ma",
    status: "Completed",
  },
  {
    id: "def-4",
    title: "Moroccan Robotics Challenge",
    date: "08-09 Dec 2024",
    image_url: "/events/competition.png",
    link: "https://ests.uca.ma",
    status: "Completed",
  },
  {
    id: "def-5",
    title: "ROS2 Drone & PX4 Flight Testing",
    date: "20 Jan 2025",
    image_url: "/events/drone.png",
    link: "https://ests.uca.ma",
    status: "Completed",
  },
  {
    id: "def-6",
    title: "Engineering Tech Expo",
    date: "12 Mar 2025",
    image_url: "/events/expo.png",
    link: "https://ests.uca.ma",
    status: "Upcoming",
  },
];

const CARD_SIZES = ["medium", "small", "large", "medium", "small"];
// Subtle, balanced vertical offsets so cards are never cropped at top/bottom of the screen
const OFFSETS = ["15px", "-15px", "20px", "-10px", "10px", "-20px"];

const MONTH_MAP: Record<string, number> = {
  jan: 0, janv: 0, janvier: 0, january: 0,
  feb: 1, fevr: 1, février: 1, fevrier: 1, february: 1,
  mar: 2, mars: 2, march: 2,
  apr: 3, avr: 3, avril: 3, april: 3,
  may: 4, mai: 4,
  jun: 5, juin: 5, june: 5,
  jul: 6, juil: 6, juillet: 6, july: 6,
  aug: 7, aout: 7, août: 7, august: 7,
  sep: 8, sept: 8, septembre: 8, september: 8,
  oct: 9, octo: 9, octobre: 9, october: 9,
  nov: 10, nove: 10, novembre: 10, november: 10,
  dec: 11, dece: 11, décembre: 11, decembre: 11, december: 11,
};

export function parseEventDate(item: EventRow): number {
  let dataObj: any = item?.data;
  if (typeof dataObj === "string") {
    try {
      dataObj = JSON.parse(dataObj);
    } catch {
      dataObj = {};
    }
  }
  if (!dataObj || typeof dataObj !== "object") {
    dataObj = {};
  }

  const dateStr = String(item?.date || dataObj.date || item?.event_date || dataObj.event_date || "");
  const titleStr = String(item?.title || dataObj.title || "");

  // 1. Extract 4-digit year from date string or title
  let year: number | null = null;
  const dateYearMatch = dateStr.match(/\b(20\d{2})\b/);
  if (dateYearMatch) {
    year = parseInt(dateYearMatch[1], 10);
  } else {
    const titleYearMatch = titleStr.match(/\b(20\d{2})\b/);
    if (titleYearMatch) {
      year = parseInt(titleYearMatch[1], 10);
    }
  }

  if (!year && item?.created_at) {
    const parsedCreated = new Date(item.created_at).getFullYear();
    if (!isNaN(parsedCreated)) {
      year = parsedCreated;
    }
  }

  if (!year) year = 2000;

  // 2. Extract month
  let month = 0;
  const words = dateStr
    .toLowerCase()
    .replace(/[^a-zàâçéèêëîïôûùüÿñæœ]/g, " ")
    .split(/\s+/);

  for (const word of words) {
    if (MONTH_MAP[word] !== undefined) {
      month = MONTH_MAP[word];
      break;
    }
  }

  // 3. Extract day number
  let day = 1;
  const dayMatch = dateStr.match(/(\d{1,2})(?:\s*-\s*\d{1,2})?/);
  if (dayMatch) {
    day = parseInt(dayMatch[1], 10);
  }

  return new Date(Date.UTC(year, month, day)).getTime();
}

export function getEventLink(item: EventRow): string {
  if (!item) return "";
  let dataObj: any = item.data;
  if (typeof dataObj === "string") {
    try {
      dataObj = JSON.parse(dataObj);
    } catch {
      dataObj = {};
    }
  }
  if (!dataObj || typeof dataObj !== "object") {
    dataObj = {};
  }

  let rawLink =
    item.links ??
    item.link ??
    dataObj.links ??
    dataObj.link ??
    item.url ??
    dataObj.url ??
    item.website ??
    dataObj.website ??
    item.event_link ??
    dataObj.event_link ??
    item.href ??
    dataObj.href ??
    "";

  if (Array.isArray(rawLink)) {
    const found = rawLink.find((l) => typeof l === "string" && l.trim()) || rawLink[0];
    if (typeof found === "string") {
      rawLink = found;
    } else if (found && typeof found === "object") {
      rawLink = found.url || found.link || found.href || "";
    }
  } else if (rawLink && typeof rawLink === "object") {
    rawLink = rawLink.url || rawLink.link || rawLink.href || "";
  }

  if (typeof rawLink !== "string") return "";
  const trimmed = rawLink.trim();
  if (!trimmed) return "";

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export default function EventsList({ onLoaded }: EventsListProps) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvents() {
      try {
        setLoading(true);
        setError(null);

        // Use publicContent client (session-independent) to avoid expired officer token issues
        const client = publicContent || supabase;
        let data: any[] | null = null;
        let fetchErr: any = null;

        try {
          const res = await withRequestTimeout(
            client.from("events").select("*").order("id", { ascending: false }),
            "Public events",
            6000
          );
          data = res.data;
          fetchErr = res.error;
        } catch (err) {
          fetchErr = err;
        }

        // Fallback to standard supabase client if publicContent returned an error
        if (fetchErr || !data || data.length === 0) {
          try {
            const fallbackRes = await supabase.from("events").select("*").order("id", { ascending: false });
            if (!fallbackRes.error && fallbackRes.data && fallbackRes.data.length > 0) {
              data = fallbackRes.data;
              fetchErr = null;
            }
          } catch {
            // Ignore fallback error
          }
        }

        if (data && Array.isArray(data) && data.length > 0) {
          const mapped: EventRow[] = data.map((row) => {
            const view = eventView(row);
            return {
              id: row.id,
              title: view.title,
              date: view.date,
              image_url: safeEventUrl(view.image_url, true) || "/events/workshop.png",
              link: view.link,
              status: view.status,
              description: view.description,
              created_at: row.created_at,
              data: row.data,
            };
          });
          const sortedEvents = mapped.sort((a, b) => parseEventDate(b) - parseEventDate(a));
          setEvents(sortedEvents);
        } else {
          // If database returned 0 records or error occurred, provide curated default events
          setEvents(DEFAULT_EVENTS);
        }
      } catch (err: any) {
        console.warn("Error fetching events from Supabase, using defaults:", err);
        setEvents(DEFAULT_EVENTS);
      } finally {
        setLoading(false);
        if (onLoaded) {
          setTimeout(onLoaded, 50);
        }
      }
    }

    fetchEvents();
  }, [onLoaded]);

  if (loading) {
    return (
      <div className="events-loading" style={{ padding: "40px", color: "#94a3b8", fontSize: "15px" }}>
        Loading events...
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="events-empty" style={{ padding: "40px", color: "#94a3b8", fontSize: "15px" }}>
        No events found.
      </div>
    );
  }

  return (
    <>
      {events.map((item, index) => {
        const dataObj = item?.data && typeof item.data === "object" ? item.data : {};
        let parsedData = dataObj;
        if (typeof item?.data === "string") {
          try {
            parsedData = JSON.parse(item.data);
          } catch {
            parsedData = {};
          }
        }

        const title = String(parsedData.title || item?.title || "UNTITLED EVENT");
        const date = String(parsedData.date || item?.date || "");
        const image =
          item?.image_url ||
          parsedData.image_url ||
          parsedData.image ||
          item?.image ||
          "/events/summit.png";

        const eventLink = getEventLink(item);
        const isExternal = /^https?:\/\//i.test(eventLink);

        const size = CARD_SIZES[index % CARD_SIZES.length];
        const offsetY = OFFSETS[index % OFFSETS.length];
        const isImgTop = parseInt(offsetY) < 0;

        return (
          <div
            key={item?.id || index}
            className={`event-card-wrapper size-${size} ${
              isImgTop ? "img-top" : "img-bottom"
            }`}
            style={{ transform: `translateY(${offsetY})` }}
          >
            <a
              href={eventLink || "#events"}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              className="event-card-link"
              aria-label={`View details for ${title}`}
              onClick={(e) => {
                if (!eventLink || eventLink === "#events") {
                  e.preventDefault();
                }
              }}
            >
              <div className="event-image-container">
                <img
                  src={image}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                  className="event-img"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.dataset.fallback) return;
                    img.dataset.fallback = "true";
                    img.src = "/events/summit.png";
                  }}
                />
                <div className="event-img-overlay" />
              </div>

              <div className="event-card-text">
                {date && (
                  <div className="event-meta">
                    <span className="event-date">{date}</span>
                  </div>
                )}
                <div className="event-card-info">
                  <h3 className="event-card-title">
                    <span className="event-title-char">{title}</span>
                  </h3>
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
