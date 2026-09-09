import { useState, useEffect } from "react";
import { publicContent, supabase } from "../../lib/supabaseClient";
import { readClubSettings, shortSeason } from "../../lib/clubSettings";
import { RevealHeadingLine } from "../common/TextAnimations";
import { withRequestTimeout } from "../../lib/requestTimeout";
import "./TeamSection.css";

const DEFAULT_TEAM_MEMBERS = [
  {
    id: "def-team-1",
    name: "Imrane Errafi",
    department: "Génie Informatique",
    role: "President",
    image: "/imrane-anime.png",
    hoverImage: null,
    birthday: null,
    orderPostVal: 1,
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
    season: "25-26",
  },
  {
    id: "def-team-2",
    name: "Aya Mansouri",
    department: "Génie Électrique (GIME)",
    role: "Vice President",
    image: "/Imrane_anime.png",
    hoverImage: null,
    birthday: null,
    orderPostVal: 2,
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
    season: "25-26",
  },
  {
    id: "def-team-3",
    name: "Mehdi Alami",
    department: "Génie Informatique",
    role: "AI Lead",
    image: "/Imrane_anime.png",
    hoverImage: null,
    birthday: null,
    orderPostVal: 3,
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
    season: "25-26",
  },
  {
    id: "def-team-4",
    name: "Yassine Berrada",
    department: "Génie Industriel & Maintenance",
    role: "Robotics Lead",
    image: "/Imrane_anime.png",
    hoverImage: null,
    birthday: null,
    orderPostVal: 4,
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
    season: "25-26",
  },
];

// Normalizes any raw season key (e.g. "2024-2025", "2024", "24/25", "24-25") to canonical short season ("24-25")
const normalizeSeasonKey = (raw = "") => {
  if (!raw) return "";
  const str = String(raw).trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (
    str === "24-25" ||
    str === "2024-2025" ||
    str === "24/25" ||
    str === "2024/2025" ||
    str === "2024-25" ||
    str === "2024" ||
    str === "24"
  ) {
    return "24-25";
  }
  if (
    str === "25-26" ||
    str === "2025-2026" ||
    str === "25/26" ||
    str === "2025/2026" ||
    str === "2025-26" ||
    str === "2025" ||
    str === "25"
  ) {
    return "25-26";
  }
  if (
    str === "26-27" ||
    str === "2026-2027" ||
    str === "26/27" ||
    str === "2026/2027" ||
    str === "2026-27" ||
    str === "2026" ||
    str === "26"
  ) {
    return "26-27";
  }
  const match = str.match(/(?:20)?(\d{2})[-/](?:20)?(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  return str;
};

// Returns alternate equivalent keys to query from Supabase or match in data structures
const getEquivalentSeasonKeys = (season = "") => {
  const norm = normalizeSeasonKey(season);
  if (norm === "24-25") return ["24-25", "2024-2025", "24/25", "2024", "24"];
  if (norm === "25-26") return ["25-26", "2025-2026", "25/26", "2025", "25"];
  if (norm === "26-27") return ["26-27", "2026-2027", "26/27", "2026", "26"];
  const match = norm.match(/^(\d{2})-(\d{2})$/);
  return match ? [norm, `20${match[1]}-20${match[2]}`, `${match[1]}/${match[2]}`] : [season, norm];
};

// Helper to extract years array from member record
const getMemberYears = (m) => {
  if (Array.isArray(m?.team_seasons) && m.team_seasons.length > 0) {
    return m.team_seasons.map((ts) => ts.season).filter(Boolean);
  }
  if (m?.season_roles && typeof m.season_roles === "object" && Object.keys(m.season_roles).length > 0) {
    return Object.keys(m.season_roles);
  }
  const rawYears = m?.years || m?.data?.years;
  if (Array.isArray(rawYears) && rawYears.length > 0) return rawYears.map(String);
  if (typeof rawYears === "string" && rawYears) return rawYears.split(",").map((s) => s.trim());
  return ["25-26"];
};

// Helper to extract role for a season
const getMemberRoleForYear = (m, year) => {
  const equivKeys = getEquivalentSeasonKeys(year);
  if (Array.isArray(m?.team_seasons) && m.team_seasons.length > 0) {
    const found = m.team_seasons.find((ts) => ts.season && equivKeys.includes(ts.season));
    if (found?.role) return found.role;
    if (m.team_seasons[0]?.role) return m.team_seasons[0].role;
  }
  if (m?.season_roles && typeof m.season_roles === "object") {
    for (const k of equivKeys) {
      if (m.season_roles[k]) return m.season_roles[k];
    }
  }
  return m?.post || m?.role || m?.data?.role || "Team Member";
};

// Helper to extract post order
const getMemberPostOrder = (m, year) => {
  const equivKeys = getEquivalentSeasonKeys(year);
  if (Array.isArray(m?.team_seasons) && m.team_seasons.length > 0) {
    const found = m.team_seasons.find((ts) => ts.season && equivKeys.includes(ts.season));
    if (found && found.post_order !== null && found.post_order !== undefined && !isNaN(Number(found.post_order))) {
      return Number(found.post_order);
    }
  }
  if (m?.post_order && typeof m.post_order === "object") {
    for (const k of equivKeys) {
      if (m.post_order[k] !== undefined) return Number(m.post_order[k]);
    }
  }
  if (m?.post_order !== null && m?.post_order !== undefined && !isNaN(Number(m.post_order))) {
    return Number(m.post_order);
  }
  return Infinity;
};

// Helper to extract member data object
const mapMemberRecord = (m, year) => ({
  id: m.id,
  name: m.full_name || m.name || "Club Member",
  department: m.department || m.filiere || "",
  role: getMemberRoleForYear(m, year),
  postAbbr: (Array.isArray(m.team_seasons) ? m.team_seasons.find((ts) => getEquivalentSeasonKeys(year).includes(ts.season))?.post_abbr : "") || "",
  orderPostVal: getMemberPostOrder(m, year),
  image: m.avatar_img || m.image || m.image_url || "/Imrane_anime.png",
  hoverImage: m.normal_img || m.normal_image || null,
  birthday: m.birthday || null,
  socials: {
    instagram: m.social_media_links?.instagram || m.instagram || "",
    linkedin: m.social_media_links?.linkedin || m.linkedin || "",
    github: m.social_media_links?.github || m.github || "",
  },
  season: year,
});

function resolveTeamRecords(rawData, targetSeason = "25-26") {
  let resolvedSeason = targetSeason;
  let resolvedMembers = [];

  if (rawData.length > 0) {
    const equivKeys = getEquivalentSeasonKeys(targetSeason);
    let matching = rawData.filter((member) => {
      const memberYears = getMemberYears(member);
      return equivKeys.some((key) => memberYears.includes(key));
    });

    if (matching.length === 0) {
      const candidateSeasons = ["25-26", "24-25", "26-27"];
      for (const candidate of candidateSeasons) {
        const candidateKeys = getEquivalentSeasonKeys(candidate);
        const candidateMembers = rawData.filter((member) => {
          const memberYears = getMemberYears(member);
          return candidateKeys.some((key) => memberYears.includes(key));
        });
        if (candidateMembers.length > 0) {
          matching = candidateMembers;
          resolvedSeason = candidate;
          break;
        }
      }
    }

    if (matching.length === 0) matching = rawData;
    resolvedMembers = matching.map((member) => mapMemberRecord(member, resolvedSeason));
    resolvedMembers.sort((a, b) => {
      if (a.orderPostVal !== b.orderPostVal) return a.orderPostVal - b.orderPostVal;
      return (a.name || "").localeCompare(b.name || "");
    });
  } else {
    resolvedMembers = DEFAULT_TEAM_MEMBERS;
    resolvedSeason = "25-26";
  }

  return { members: resolvedMembers, season: resolvedSeason };
}

export default function TeamSection({ initialTeam = null, initialSeason = "25-26" }) {
  const hasInitialTeam = Array.isArray(initialTeam);
  const initialRoster = hasInitialTeam ? resolveTeamRecords(initialTeam, initialSeason) : null;
  const [members, setMembers] = useState(() => initialRoster?.members || []);
  const [loading, setLoading] = useState(!hasInitialTeam);
  const [selectedYear, setSelectedYear] = useState(() => initialRoster?.season || initialSeason);
  const [hoveredCardId, setHoveredCardId] = useState(null);

  useEffect(() => {
    if (hasInitialTeam) {
      const resolved = resolveTeamRecords(initialTeam, initialSeason);
      setSelectedYear(resolved.season);
      setMembers(resolved.members);
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadTeam() {
      try {
        setLoading(true);

        // 1. Determine published season from club_settings
        let targetSeason = "25-26";
        try {
          const client = publicContent || supabase;
          const settings = await withRequestTimeout(readClubSettings(client), "Club settings", 4000);
          if (settings && settings.public_staff_season) {
            const parsed = shortSeason(settings.public_staff_season);
            if (parsed) targetSeason = parsed;
          }
        } catch {
          // Default to "25-26" if settings table is not configured
          targetSeason = "25-26";
        }

        // 2. Fetch all staff members using session-independent publicContent client
        const client = publicContent || supabase;
        let rawData = [];

        try {
          const res = await withRequestTimeout(
            client
              .from("team")
              .select(`
                id,
                full_name,
                avatar_img,
                normal_img,
                birthday,
                department,
                social_media_links,
                team_seasons (
                  id,
                  team_id,
                  season,
                  role,
                  post_abbr,
                  post_order
                )
              `)
              .order("id", { ascending: false }),
            "Public team",
            6000
          );
          if (!res.error && res.data && res.data.length > 0) {
            rawData = res.data;
          }
        } catch (err) {
          console.warn("Relational team query failed, trying fallback:", err);
        }

        // Fallback: try standard supabase client
        if (rawData.length === 0) {
          try {
            const retry = await supabase.from("team").select("*, team_seasons(*)");
            if (!retry.error && retry.data && retry.data.length > 0) {
              rawData = retry.data;
            }
          } catch {
            // Ignore
          }
        }

        // Fallback: flat select from team
        if (rawData.length === 0) {
          try {
            const fallback = await client.from("team").select("*");
            if (!fallback.error && fallback.data && fallback.data.length > 0) {
              rawData = fallback.data;
            }
          } catch {
            // Ignore
          }
        }

        const resolved = resolveTeamRecords(rawData, targetSeason);

        if (isMounted) {
          setSelectedYear(resolved.season);
          setMembers(resolved.members);
        }
      } catch (err) {
        console.warn("Unexpected team fetch error, using defaults:", err);
        if (isMounted) {
          setSelectedYear("25-26");
          setMembers(DEFAULT_TEAM_MEMBERS);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadTeam();

    return () => {
      isMounted = false;
    };
  }, [hasInitialTeam, initialSeason, initialTeam]);

  const filteredMembers = members;

  // Distribute sorted members into 4 staggered columns
  const columns = [[], [], [], []];
  filteredMembers.forEach((member, index) => {
    columns[index % 4].push(member);
  });

  return (
    <section id="team" className="team-section">
      {/* Ambient Background Glow */}
      <div className="team-bg-glow" aria-hidden="true" />

      {/* SVG ClipPath Definition for Square (1:1) Notched Card Frame */}
      <svg className="team-svg-defs" aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}>
        <defs>
          <clipPath id="teamCardClip" clipPathUnits="objectBoundingBox">
            <path d="M 0.0167,0 H 0.9833 A 0.0167,0.0167 0 0 1 1,0.0167 V 0.9833 A 0.0167,0.0167 0 0 1 0.9833,1 H 0.5833 C 0.54,1 0.52,0.92 0.4733,0.92 H 0.0167 A 0.0167,0.0167 0 0 1 0,0.9033 V 0.0167 A 0.0167,0.0167 0 0 1 0.0167,0 Z" />
          </clipPath>
        </defs>
      </svg>

      <div className="team-container">
        {/* Top Split Header */}
        <div className="team-split-header">
          <h2 className="team-main-title">
            <RevealHeadingLine delay={0} className="team-title-line" as="div">
              <span className="title-part-white">ROBOTICS </span>
              <span className="title-part-blue">AND </span>
              <span className="title-part-white">AI</span>
            </RevealHeadingLine>
            <RevealHeadingLine delay={100} className="team-title-line" as="div">
              <span className="title-part-blue">CLUB </span>
              <span className="title-part-white">TEAM</span>
            </RevealHeadingLine>
          </h2>

          <div className="team-description-wrapper">
            <p className="team-description-text">
              A passionate collective of student innovators and engineers at EST Safi, building intelligent autonomous systems and competing in national robotics challenges.
            </p>
          </div>
        </div>

        <div className="team-filter-bar-wrapper"><span className="team-filter-tab is-active">STAFF / {selectedYear || "…"}</span></div>

        {/* Dynamic Content: Loading / Empty / Showcase Grid */}
        {loading ? (
          <div className="team-status-container team-loading-state">
            <div className="team-spinner" />
            <p className="team-status-text">Connecting to database & loading roster...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="team-status-container team-empty-state">
            <div className="team-empty-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h3 className="team-empty-title">Team Roster Coming Soon</h3>
            <p className="team-empty-desc">
              No team members have been published for season {selectedYear} yet. Team profiles added to the Supabase database will appear here automatically.
            </p>
          </div>
        ) : (
          /* Staggered Showcase Cards Grid */
          <div className="team-showcase-grid">
            {columns.map((column, colIdx) => (
              <div key={colIdx} className={`team-showcase-col team-col-${colIdx + 1}`}>
                {column.map((card) => {
                  const isHovered = hoveredCardId === card.id;
                  const memberOrder = filteredMembers.indexOf(card);

                  return (
                    <div
                      key={card.id}
                      className={`team-showcase-card ${isHovered ? "is-hovered" : ""} ${filteredMembers.length % 2 === 1 && memberOrder === filteredMembers.length - 1 ? "is-last-member" : ""}`}
                      style={{ "--team-order": memberOrder }}
                      onMouseEnter={() => setHoveredCardId(card.id)}
                      onMouseLeave={() => setHoveredCardId(null)}
                    >
                      {/* SVG Notched Border Frame for Square Card (300 x 300) */}
                      <svg
                        className="team-card-svg-frame"
                        viewBox="0 0 300 300"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path
                          className="team-card-path"
                          d="M 5,0 H 295 A 5,5 0 0 1 300,5 V 295 A 5,5 0 0 1 295,300 H 175 C 162,300 156,276 142,276 H 5 A 5,5 0 0 1 0,271 V 5 A 5,5 0 0 1 5,0 Z"
                        />
                      </svg>

                      {/* Card Inner Content */}
                      <div className="team-card-content">
                        {/* Full-bleed Photo Media */}
                        <div className="team-card-media-wrapper">
                          <img
                            src={card.image}
                            alt={card.name}
                            className="team-card-media team-card-media-default"
                            loading="lazy"
                          />
                          {card.hoverImage && (
                            <img
                              src={card.hoverImage}
                              alt={`${card.name} Original`}
                              className="team-card-media team-card-media-hover"
                              loading="lazy"
                            />
                          )}
                        </div>

                        {/* Bottom Info Bar: Left Name + Right Social Icons */}
                        <div className="team-card-bottom-bar">
                          {/* Bottom Left Name & Role */}
                          <div className="team-card-name-group">
                            <span className="team-card-name">{card.name}</span>
                            <span className="team-card-role">{card.role}</span>
                          </div>

                          {/* Bottom Right Notch: White Social Icons */}
                          <div className="team-card-socials-notch">
                            <a
                              href={card.socials?.instagram || "https://instagram.com"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="team-notch-social-link"
                              aria-label="Instagram"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                              </svg>
                            </a>

                            <a
                              href={card.socials?.linkedin || "https://linkedin.com"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="team-notch-social-link"
                              aria-label="LinkedIn"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                                <rect x="2" y="9" width="4" height="12" />
                                <circle cx="4" cy="4" r="2" />
                              </svg>
                            </a>

                            <a
                              href={card.socials?.github || "https://github.com"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="team-notch-social-link"
                              aria-label="GitHub"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                              </svg>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Organic Wave Transition ending Dark Mode */}
      <div className="team-bottom-wave-wrapper" aria-hidden="true">
        <svg
          className="team-bottom-wave-svg"
          viewBox="0 0 1440 180"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M-10,75 C320,145 620,12 920,88 C1180,145 1340,65 1450,82 L1450,220 L-10,220 Z"
            fill="#f4f3ee"
          />
        </svg>
      </div>

      {/* Light Mode Section / Team Appreciation & Footer */}
      <div className="team-light-section">
        <div className="team-light-container">
          <div className="team-thanks-content">
            {/* Robotics and AI Club Logo */}
            <img
              src="/RAI/club-icon-light.png"
              alt="Robotics & AI Club Logo"
              className="team-thanks-logo"
              loading="lazy"
            />

            {/* Centered Thanks Title & Subtext */}
            <h3 className="team-thanks-title">
              Special Thanks to All the Team
            </h3>

            <p className="team-thanks-text">
              Huge gratitude to all our passionate members, mentors, alumni, and contributors who dedicate their time, talent, and energy to building intelligent systems and pushing the boundaries of robotics and AI at EST Safi.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
