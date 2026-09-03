import React, { useEffect, useState } from "react";
import "./FullNavMenu.css";

const NAV_ITEMS = [
  { id: "events", label: "EVENTS", target: "#events" },
  { id: "team", label: "TEAM", target: "#team" },
  { id: "contact", label: "CONTACT", target: "#contact" },
  { id: "why-join", label: "WHY JOIN US", target: "#why-join" },
];

const GALLERY_COL_1 = [
  { src: "/why-join/why_join_main.jpg", alt: "Autonomous Rover & AI Lab", tag: "TECH // LAB" },
  { src: "/album/2.JPG", alt: "Club Team Victory & Award", tag: "HONOR // TROPHY" },
  { src: "/album/5.jpg", alt: "Engineering Workshop & Coding", tag: "CREW // WORKSHOP" },
  { src: "/why-join/why_join_gold.jpg", alt: "Competition Arena & Bot Chassis", tag: "ARENA // BUILD" },
  { src: "/album/1.jpg", alt: "Robotics Electronics & Sensors", tag: "HARDWARE // DEV" },
];

const GALLERY_COL_2 = [
  { src: "/album/3.jpg", alt: "Team Assembly & Prototyping", tag: "INNOVATION // LAB" },
  { src: "/album/4.jpg", alt: "Field Testing & Autonomous Flight", tag: "FIELD // TEST" },
  { src: "/album/6.jpg", alt: "Hackathon Sprint & Neural AI", tag: "SUMMIT // SPRINT" },
  { src: "/why-join/why_join_tee_black.jpg", alt: "Official Club Engineering Gear", tag: "IDENTITY // GEAR" },
  { src: "/album/7.jpg", alt: "Research Presentations & Community", tag: "COMMUNITY // RAI" },
];

export default function FullNavMenu({ isOpen, onClose, onNavigateRegister }) {
  const [activeItem, setActiveItem] = useState("events");
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [animateIn, setAnimateIn] = useState(false);

  // Smooth entrance and exit animation timer
  useEffect(() => {
    let timer;
    if (isOpen) {
      setShouldRender(true);
      const raf = requestAnimationFrame(() => {
        timer = setTimeout(() => {
          setAnimateIn(true);
        }, 20);
      });
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    } else {
      setAnimateIn(false);
      timer = setTimeout(() => {
        setShouldRender(false);
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on Escape key and lock background scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!shouldRender) return null;

  const handleNavClick = (item) => {
    setActiveItem(item.id);
    onClose();

    setTimeout(() => {
      if (item.target === "#root") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const el = document.querySelector(item.target);
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
        }
      }
    }, 280);
  };

  const handleJoinClick = (e) => {
    e.preventDefault();
    onClose();
    setTimeout(() => {
      if (onNavigateRegister) {
        onNavigateRegister();
      } else {
        window.location.hash = "register";
      }
    }, 200);
  };

  return (
    <div className={`full-nav-overlay ${animateIn ? "is-visible" : ""}`} role="dialog" aria-modal="true">
      {/* Topographic organic contour background lines */}
      <div className="full-nav-topography" aria-hidden="true">
        <svg viewBox="0 0 1440 900" fill="none" preserveAspectRatio="xMidYMid slice">
          <path
            d="M-100 200 C 200 150, 400 350, 700 250 C 1000 150, 1200 400, 1600 300"
            stroke="rgba(59, 130, 246, 0.14)"
            strokeWidth="1.5"
          />
          <path
            d="M-80 320 C 250 260, 450 480, 800 360 C 1100 240, 1300 520, 1650 420"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="1.5"
          />
          <path
            d="M-50 450 C 300 380, 500 600, 850 480 C 1150 360, 1350 640, 1700 550"
            stroke="rgba(56, 189, 248, 0.12)"
            strokeWidth="1.5"
          />
          <path
            d="M-120 600 C 180 520, 420 750, 780 620 C 1080 500, 1280 780, 1620 700"
            stroke="rgba(255, 255, 255, 0.04)"
            strokeWidth="1.5"
          />
          <path
            d="M200 50 C 500 120, 750 -40, 1100 80 C 1350 170, 1500 50, 1750 140"
            stroke="rgba(37, 99, 235, 0.12)"
            strokeWidth="1.5"
          />
          <path
            d="M600 850 C 850 720, 1050 900, 1350 820"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      {/* Main Drawer Grid Body */}
      <div className="full-nav-body">
        {/* Left Column: Two Columns in an Infinite Marquee Loop (3:4 ratio, frameless) */}
        <div className="full-nav-left-gallery">
          <div className="full-nav-infinite-columns">
            {/* Column 1: Infinite Loop Track Up */}
            <div className="infinite-col col-up">
              <div className="infinite-col-track">
                {[...GALLERY_COL_1, ...GALLERY_COL_1].map((img, idx) => (
                  <div key={idx} className="full-nav-img-card">
                    <div className="full-nav-img-wrapper">
                      <img src={img.src} alt={img.alt} loading="lazy" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: Infinite Loop Track Down */}
            <div className="infinite-col col-down">
              <div className="infinite-col-track">
                {[...GALLERY_COL_2, ...GALLERY_COL_2].map((img, idx) => (
                  <div key={idx} className="full-nav-img-card">
                    <div className="full-nav-img-wrapper">
                      <img src={img.src} alt={img.alt} loading="lazy" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: High-Impact Vertical Navigation */}
        <div className="full-nav-right-content">
          <nav className="full-nav-list" aria-label="Main menu">
            {NAV_ITEMS.map((item) => {
              const isActive = activeItem === item.id;
              return (
                <div
                  key={item.id}
                  className={`full-nav-item-wrapper ${isActive ? "is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="full-nav-item-btn"
                    onClick={() => handleNavClick(item)}
                  >
                    <span className="full-nav-item-text">{item.label}</span>

                    {/* Signature Wavy Neon Line crossing through active/hover link in project electric blue */}
                    <svg
                      className="full-nav-wavy-line"
                      viewBox="0 0 260 28"
                      fill="none"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient id="waveBlueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#38bdf8" />
                          <stop offset="50%" stopColor="#60a5fa" />
                          <stop offset="100%" stopColor="#2563eb" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M 2 14 Q 28 3, 56 14 T 112 14 T 168 14 T 224 14 T 258 14"
                        stroke="url(#waveBlueGrad)"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}
          </nav>

          {/* Bottom Row: Enquiries & Socials */}
          <div className="full-nav-footer-row">
            <div className="full-nav-enquiries">
              <span className="enquiries-title">CLUB & LAB ENQUIRIES</span>
              <a href="mailto:roboticsai.club.ests@gmail.com" className="enquiries-link">
                roboticsai.club.ests@gmail.com
              </a>
            </div>

            <div className="full-nav-socials">
              <a href="https://www.tiktok.com/@robotics.ai.club" target="_blank" rel="noreferrer">TIKTOK</a>
              <a href="https://www.instagram.com/robotics_aiclub.ests/" target="_blank" rel="noreferrer">INSTAGRAM</a>
              <a href="https://www.linkedin.com/in/robotics-ai-club/" target="_blank" rel="noreferrer">LINKEDIN</a>
              <a href="https://discord.gg/GdDsZjJTF" target="_blank" rel="noreferrer">DISCORD</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
