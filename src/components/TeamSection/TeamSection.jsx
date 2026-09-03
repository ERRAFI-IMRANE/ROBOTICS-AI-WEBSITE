import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import { RevealHeadingLine } from "../common/TextAnimations";
import "./TeamSection.css";

const DEFAULT_YEARS = ["24-25", "25-26", "26-27"];

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
  return [season, norm];
};

export default function TeamSection() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState("25-26");
  const [hoveredCardId, setHoveredCardId] = useState(null);
  const [allKnownYears, setAllKnownYears] = useState(DEFAULT_YEARS);

  useEffect(() => {
    let isMounted = true;

    try {
      localStorage.removeItem("rai_admin_team");
    } catch {
      // Ignore
    }

    async function fetchTeamMembers(season) {
      try {
        setLoading(true);
        const equivKeys = getEquivalentSeasonKeys(season);
        let rows = [];

        // 1. Primary: Direct query on team_seasons joined with team (Relational architecture)
        try {
          const { data: seasonsData, error: seasonsError } = await supabase
            .from("team_seasons")
            .select(`
              id,
              season,
              role,
              post_abbr,
              post_order,
              team_id,
              team:team_id (
                id,
                full_name,
                avatar_img,
                normal_img,
                birthday,
                department,
                social_media_links
              )
            `)
            .in("season", equivKeys)
            .order("post_order", { ascending: true, nullsFirst: false })
            .order("team_id", { ascending: true });

          if (!seasonsError && seasonsData && seasonsData.length > 0) {
            rows = seasonsData
              .filter((ts) => ts && ts.team)
              .map((ts) => ({
                id: ts.team.id,
                seasonId: ts.id,
                name: ts.team.full_name || "Club Member",
                department: ts.team.department || "",
                role: ts.role || "Team Member",
                postAbbr: ts.post_abbr || "",
                orderPostVal: ts.post_order !== null && ts.post_order !== undefined ? Number(ts.post_order) : Infinity,
                image: ts.team.avatar_img || "/Imrane_anime.png",
                hoverImage: ts.team.normal_img || null,
                birthday: ts.team.birthday || null,
                socials: {
                  instagram: ts.team.social_media_links?.instagram || "",
                  linkedin: ts.team.social_media_links?.linkedin || "",
                  github: ts.team.social_media_links?.github || "",
                },
                season: ts.season,
              }));
          }
        } catch (queryErr) {
          console.warn("Relational team_seasons query:", queryErr);
        }

        // 2. Fallback: Supabase RPC 'get_team_by_season'
        if (rows.length === 0) {
          for (const sKey of equivKeys) {
            try {
              const rpcRes = await supabase.rpc("get_team_by_season", {
                target_season: sKey,
              });
              if (!rpcRes.error && rpcRes.data && rpcRes.data.length > 0) {
                rows = rpcRes.data.map((r) => ({
                  id: r.id,
                  seasonId: r.season_id,
                  name: r.full_name || "Club Member",
                  department: r.department || "",
                  role: r.role || "Team Member",
                  postAbbr: r.post_abbr || "",
                  orderPostVal: r.post_order !== null && r.post_order !== undefined ? Number(r.post_order) : Infinity,
                  image: r.avatar_img || "/Imrane_anime.png",
                  hoverImage: r.normal_img || null,
                  birthday: r.birthday || null,
                  socials: {
                    instagram: r.social_media_links?.instagram || "",
                    linkedin: r.social_media_links?.linkedin || "",
                    github: r.social_media_links?.github || "",
                  },
                  season: r.season,
                }));
                break;
              }
            } catch {
              // Ignore and proceed
            }
          }
        }

        // 3. Fallback: legacy team table fallback
        if (rows.length === 0) {
          try {
            const { data: legacyData } = await supabase.from("team").select("*");
            if (legacyData && legacyData.length > 0) {
              rows = legacyData
                .filter((m) => {
                  const sRoles = m.season_roles || {};
                  return equivKeys.some((k) => sRoles[k] !== undefined);
                })
                .map((m) => {
                  let role = "Team Member";
                  for (const k of equivKeys) {
                    if (m.season_roles?.[k]) {
                      role = m.season_roles[k];
                      break;
                    }
                  }
                  let postOrder = Infinity;
                  if (m.post_order && typeof m.post_order === "object") {
                    for (const k of equivKeys) {
                      if (m.post_order[k] !== undefined) {
                        postOrder = Number(m.post_order[k]);
                        break;
                      }
                    }
                  }
                  return {
                    id: m.id,
                    name: m.full_name || "Club Member",
                    department: m.department || "",
                    role,
                    postAbbr: "",
                    orderPostVal: postOrder,
                    image: m.avatar_img || "/Imrane_anime.png",
                    hoverImage: m.normal_img || null,
                    birthday: m.birthday || null,
                    socials: {
                      instagram: m.social_media_links?.instagram || "",
                      linkedin: m.social_media_links?.linkedin || "",
                      github: m.social_media_links?.github || "",
                    },
                    season: season,
                  };
                });
            }
          } catch {
            // Ignore
          }
        }

        // Sort by post_order ASC NULLS LAST, then name/id ASC
        rows.sort((a, b) => {
          if (a.orderPostVal !== b.orderPostVal) {
            return a.orderPostVal - b.orderPostVal;
          }
          return (a.name || "").localeCompare(b.name || "");
        });

        if (isMounted) {
          setMembers(rows);
        }

        // Refresh known seasons from team_seasons table
        try {
          const { data: allSeasons } = await supabase
            .from("team_seasons")
            .select("season");

          if (allSeasons && allSeasons.length > 0 && isMounted) {
            const discovered = new Set(DEFAULT_YEARS);
            allSeasons.forEach((s) => {
              if (s.season) {
                const norm = normalizeSeasonKey(s.season);
                if (norm !== "23-24" && norm !== "2023-2024" && norm !== "2023") {
                  discovered.add(norm);
                }
              }
            });

            const sorted = Array.from(discovered).sort((a, b) => {
              const order = ["24-25", "25-26", "26-27"];
              const idxA = order.indexOf(a);
              const idxB = order.indexOf(b);
              if (idxA !== -1 && idxB !== -1) return idxA - idxB;
              if (idxA !== -1) return -1;
              if (idxB !== -1) return 1;
              return a.localeCompare(b);
            });
            setAllKnownYears(sorted);
          }
        } catch {
          // Keep defaults
        }
      } catch (err) {
        console.warn("Could not fetch team members from Supabase:", err);
        if (isMounted) {
          setMembers([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchTeamMembers(selectedYear);

    return () => {
      isMounted = false;
    };
  }, [selectedYear]);

  const availableYears = allKnownYears;
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

        {/* Minimalist Year Filter Bar — plain labels with sliding underline */}
        <div className="team-filter-bar-wrapper">
          {availableYears.length > 3 && (
            <button
              type="button"
              className="team-filter-chevron team-filter-chevron--left"
              aria-label="Scroll years left"
              onClick={() => {
                const track = document.querySelector('.team-filter-bar');
                if (track) track.scrollBy({ left: -120, behavior: 'smooth' });
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          )}
          <div
            className="team-filter-bar"
            role="tablist"
            aria-label="Select Team Season"
            onKeyDown={(e) => {
              const idx = availableYears.indexOf(selectedYear);
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                const next = availableYears[(idx + 1) % availableYears.length];
                setSelectedYear(next);
                e.currentTarget.querySelector(`[data-year="${next}"]`)?.focus();
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = availableYears[(idx - 1 + availableYears.length) % availableYears.length];
                setSelectedYear(prev);
                e.currentTarget.querySelector(`[data-year="${prev}"]`)?.focus();
              }
            }}
          >
            {availableYears.map((year, i) => {
              const isActive = selectedYear === year;
              return (
                <button
                  key={year}
                  type="button"
                  role="tab"
                  data-year={year}
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  className={`team-filter-tab ${isActive ? "is-active" : ""}`}
                  onClick={() => setSelectedYear(year)}
                >
                  {year}
                </button>
              );
            })}
          </div>
          {availableYears.length > 3 && (
            <button
              type="button"
              className="team-filter-chevron team-filter-chevron--right"
              aria-label="Scroll years right"
              onClick={() => {
                const track = document.querySelector('.team-filter-bar');
                if (track) track.scrollBy({ left: 120, behavior: 'smooth' });
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          )}
        </div>

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

                  return (
                    <div
                      key={card.id}
                      className={`team-showcase-card ${isHovered ? "is-hovered" : ""}`}
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
