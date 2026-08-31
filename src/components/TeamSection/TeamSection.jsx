import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import "./TeamSection.css";

const DEFAULT_YEARS = ["2025-2026", "2024-2025", "2023-2024"];

export default function TeamSection() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState("2025-2026");
  const [hoveredCardId, setHoveredCardId] = useState(null);
  const [allKnownYears, setAllKnownYears] = useState(DEFAULT_YEARS);

  useEffect(() => {
    let isMounted = true;

    // Clean up any old cached static data from browser storage
    try {
      localStorage.removeItem("rai_admin_team");
    } catch {
      // Ignore
    }

    async function fetchTeamMembers(season) {
      try {
        setLoading(true);

        // 1. Try Supabase RPC 'get_team_by_season' which extracts order_post/post_order and sorts ASC
        let { data, error } = await supabase.rpc("get_team_by_season", {
          season: season,
        });

        // 2. Fallback to direct queries ordered by order_post / post_order if RPC is not deployed yet
        if (error || !data) {
          const directRes1 = await supabase
            .from("team")
            .select("*")
            .order(`order_post->${season}`, { ascending: true, nullsFirst: false });

          if (!directRes1.error && directRes1.data) {
            data = directRes1.data;
          } else {
            const directRes2 = await supabase
              .from("team")
              .select("*")
              .order(`post_order->${season}`, { ascending: true, nullsFirst: false });

            if (!directRes2.error && directRes2.data) {
              data = directRes2.data;
            } else {
              // 3. Fallback to standard select (sorting will be applied client-side)
              const retryRes = await supabase.from("team").select("*");
              if (!retryRes.error && retryRes.data) {
                data = retryRes.data;
              }
            }
          }
        }

        if (isMounted) {
          const rows = data && Array.isArray(data) ? data : [];
          setMembers(rows);

          // Collect any newly discovered season years
          const discoveredYears = new Set(allKnownYears);
          rows.forEach((m) => {
            if (m.season_roles && typeof m.season_roles === "object") {
              Object.keys(m.season_roles).forEach((yr) => yr && discoveredYears.add(yr));
            }
            if (m.order_post && typeof m.order_post === "object") {
              Object.keys(m.order_post).forEach((yr) => yr && discoveredYears.add(yr));
            }
            if (m.post_order && typeof m.post_order === "object") {
              Object.keys(m.post_order).forEach((yr) => yr && discoveredYears.add(yr));
            }
            if (Array.isArray(m.years)) {
              m.years.forEach((yr) => yr && discoveredYears.add(String(yr)));
            }
          });
          setAllKnownYears(Array.from(discoveredYears).sort().reverse());
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

  // Helper to extract numeric post order for a member in a specific season
  const getMemberPostOrder = (m, season) => {
    const data = m.data || {};
    const orderSources = [
      m.order_post,
      m.post_order,
      data.order_post,
      data.post_order,
      m.order,
      data.order,
      m.orderPost,
      m.postOrder,
    ];

    for (const src of orderSources) {
      if (src !== undefined && src !== null && src !== "") {
        if (typeof src === "object" && !Array.isArray(src)) {
          if (src[season] !== undefined && src[season] !== null && src[season] !== "") {
            const parsed = Number(src[season]);
            if (!isNaN(parsed)) return parsed;
          }
        } else {
          const parsed = Number(src);
          if (!isNaN(parsed)) return parsed;
        }
      }
    }

    return Infinity;
  };

  // Normalize member objects from diverse schema representations
  const normalizedMembers = members.map((m, idx) => {
    const data = m.data || {};
    const avatar = m.avatar_img || m.image || m.image_url || m.avatar || data.image || data.image_url || "/Imrane_anime.png";
    const normal = m.normal_img || m.normal_image || m.normalImage || m.hover_image || m.hoverImage || data.normalImage || data.hoverImage || null;
    const name = m.full_name || m.name || data.name || "Club Member";
    const department = m.department || m.filiere || data.filiere || "";
    const socials = m.social_media_links || m.socials || data.socials || {};
    const orderPost = m.order_post || m.post_order || data.order_post || data.post_order || m.order || data.order || {};

    // Get season roles mapping: { "2024-2025": "Club President", ... }
    let seasonRoles = {};
    if (m.season_roles && typeof m.season_roles === "object" && Object.keys(m.season_roles).length > 0) {
      seasonRoles = { ...m.season_roles };
    } else {
      const fallbackRole = m.post || m.role || data.role || "Team Member";
      let rawYears = m.years || data.years;
      let memberYears = [];
      if (Array.isArray(rawYears) && rawYears.length > 0) {
        memberYears = rawYears.map(String);
      } else if (typeof rawYears === "string" && rawYears) {
        memberYears = rawYears.split(",").map((s) => s.trim());
      } else if (m.year || data.year) {
        memberYears = String(m.year || data.year).split(",").map((s) => s.trim());
      } else {
        memberYears = ["2025-2026"];
      }
      memberYears.forEach((yr) => {
        seasonRoles[yr] = fallbackRole;
      });
    }

    const memberYears = Array.from(
      new Set([
        ...Object.keys(seasonRoles),
        ...(typeof orderPost === "object" && !Array.isArray(orderPost) ? Object.keys(orderPost) : []),
      ])
    );

    return {
      id: m.id || data.id || `mem-${idx}`,
      name,
      department,
      seasonRoles,
      orderPost,
      postOrder: orderPost,
      rawMember: m,
      years: memberYears,
      image: avatar,
      hoverImage: normal,
      socials: {
        instagram: socials.instagram || m.instagram || "",
        linkedin: socials.linkedin || m.linkedin || "",
        github: socials.github || m.github || "",
      },
    };
  });

  // Calculate dynamic list of years
  const availableYearsSet = new Set([...allKnownYears, ...DEFAULT_YEARS]);
  normalizedMembers.forEach((m) => m.years.forEach((yr) => yr && availableYearsSet.add(yr)));
  const availableYears = Array.from(availableYearsSet).sort().reverse();

  // Filter members by selected year and assign role for this season.
  // Order members for each year strictly according to the order_post attribute.
  const filteredMembers = normalizedMembers
    .filter(
      (member) =>
        member.years.includes(selectedYear) ||
        (selectedYear === "2025-2026" && member.years.includes("2025")) ||
        (member.orderPost && typeof member.orderPost === "object" && member.orderPost[selectedYear] !== undefined) ||
        (member.seasonRoles && member.seasonRoles[selectedYear] !== undefined)
    )
    .map((member) => ({
      ...member,
      role: member.seasonRoles?.[selectedYear] || Object.values(member.seasonRoles || {})[0] || "Team Member",
      orderPostVal: getMemberPostOrder(member.rawMember || member, selectedYear),
    }))
    .sort((a, b) => {
      if (a.orderPostVal !== b.orderPostVal) {
        return a.orderPostVal - b.orderPostVal;
      }
      return (a.name || "").localeCompare(b.name || "");
    });

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
            <div className="team-title-line">
              <span className="title-part-white">ROBOTICS </span>
              <span className="title-part-blue">AND </span>
              <span className="title-part-white">AI</span>
            </div>
            <div className="team-title-line">
              <span className="title-part-blue">CLUB </span>
              <span className="title-part-white">TEAM</span>
            </div>
          </h2>

          <div className="team-description-wrapper">
            <p className="team-description-text">
              A passionate collective of student innovators and engineers at EST Safi, building intelligent autonomous systems and competing in national robotics challenges.
            </p>
          </div>
        </div>

        {/* Minimalist Centered Year Filter Bar */}
        <div className="team-filter-bar-wrapper">
          <div className="team-filter-bar">
            {availableYears.map((year) => {
              const isActive = selectedYear === year;
              return (
                <button
                  key={year}
                  type="button"
                  className={`team-filter-pill ${isActive ? "is-active" : ""}`}
                  onClick={() => setSelectedYear(year)}
                >
                  <span>{year}</span>
                </button>
              );
            })}
          </div>
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
              No team members have been published for {selectedYear} yet. Team profiles added to the Supabase database will appear here automatically.
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
