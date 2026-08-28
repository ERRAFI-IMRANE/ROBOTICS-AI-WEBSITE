import { useState } from "react";
import "./TeamSection.css";

const ALL_MEMBERS = [
  // 2025 Roster
  {
    id: 1,
    name: "Imrane Errafi",
    role: "Club President & Founder",
    year: "2025",
    image: "/Imrane_anime.png",
    hoverImage: "/Imrane.jpg",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 2,
    name: "Yassine Benali",
    role: "Vice President & Tech Lead",
    year: "2025",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 3,
    name: "Fatima-Zahra",
    role: "Head of Artificial Intelligence",
    year: "2025",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 4,
    name: "Mehdi Alami",
    role: "Robotics Systems Engineer",
    year: "2025",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 5,
    name: "Salma Mansouri",
    role: "Cloud & IoT Systems Lead",
    year: "2025",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 6,
    name: "Amine Chraibi",
    role: "Event & Hackathon Director",
    year: "2025",
    image: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 7,
    name: "Aya Tazi",
    role: "Robotics Hardware Specialist",
    year: "2025",
    image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 8,
    name: "Omar Kadiri",
    role: "Computer Vision Engineer",
    year: "2025",
    image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },

  // 2024 Roster
  {
    id: 9,
    name: "Mehdi Alami",
    role: "Robotics Systems Engineer",
    year: "2024",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 10,
    name: "Aya Tazi",
    role: "Robotics Hardware Specialist",
    year: "2024",
    image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 11,
    name: "Nour Hamidi",
    role: "Drone Navigation Engineer",
    year: "2024",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 12,
    name: "Reda Bennani",
    role: "Control Systems Lead",
    year: "2024",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 13,
    name: "Sara Chafiq",
    role: "AI Research Specialist",
    year: "2024",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 14,
    name: "Anas Tlemcani",
    role: "Software Infrastructure Lead",
    year: "2024",
    image: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 15,
    name: "Lina Mourid",
    role: "Creative Media Director",
    year: "2024",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 16,
    name: "Walid Kabbaj",
    role: "Firmware Developer",
    year: "2024",
    image: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },

  // 2023 Roster
  {
    id: 17,
    name: "Karim Saidi",
    role: "Mechatronics Lead",
    year: "2023",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 18,
    name: "Hiba Bennani",
    role: "Sensors Specialist",
    year: "2023",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 19,
    name: "Ziad Fassi",
    role: "Edge AI Lead",
    year: "2023",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 20,
    name: "Othmane Berrada",
    role: "Hardware Architect",
    year: "2023",
    image: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 21,
    name: "Kenza Alami",
    role: "Embedded Systems Developer",
    year: "2023",
    image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 22,
    name: "Hamza Drissi",
    role: "Computer Vision Engineer",
    year: "2023",
    image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 23,
    name: "Rim Mansour",
    role: "Automation Lead",
    year: "2023",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
  {
    id: 24,
    name: "Tarik Zerouali",
    role: "Robotics Developer",
    year: "2023",
    image: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=600&auto=format&fit=crop&q=80",
    socials: {
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
    },
  },
];

const YEARS = ["2025", "2024", "2023"];

export default function TeamSection() {
  const [selectedYear, setSelectedYear] = useState("2025");
  const [hoveredCardId, setHoveredCardId] = useState(null);

  // Filter members by selected year (defaults to current year: 2025)
  const filteredMembers = ALL_MEMBERS.filter((member) => member.year === selectedYear);

  // Distribute into 4 staggered columns
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
            <path d="M 0.0333,0 H 0.9667 A 0.0333,0.0333 0 0 1 1,0.0333 V 0.9667 A 0.0333,0.0333 0 0 1 0.9667,1 H 0.5833 C 0.54,1 0.52,0.92 0.4733,0.92 H 0.0333 A 0.0333,0.0333 0 0 1 0,0.8867 V 0.0333 A 0.0333,0.0333 0 0 1 0.0333,0 Z" />
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
            {YEARS.map((year) => {
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

        {/* Staggered Showcase Cards Grid */}
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
                        d="M 10,0 H 290 A 10,10 0 0 1 300,10 V 290 A 10,10 0 0 1 290,300 H 175 C 162,300 156,276 142,276 H 10 A 10,10 0 0 1 0,266 V 10 A 10,10 0 0 1 10,0 Z"
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
      </div>
    </section>
  );
}
