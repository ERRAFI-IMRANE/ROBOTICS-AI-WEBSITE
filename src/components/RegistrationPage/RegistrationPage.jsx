import React, { useState, useEffect, useCallback, useRef } from "react";
import Footer from "../Footer/Footer";
import RegistrationForm from "./RegistrationForm";
import "./RegistrationPage.css";

const GALLERY_COL_1 = [
  { src: "/why-join/why_join_main.jpg", alt: "Autonomous Rover & AI Lab" },
  { src: "/album/2.JPG", alt: "Club Team Victory & Award" },
  { src: "/album/5.jpg", alt: "Engineering Workshop & Coding" },
  { src: "/why-join/why_join_gold.jpg", alt: "Competition Arena & Bot Chassis" },
  { src: "/album/1.jpg", alt: "Robotics Electronics & Sensors" },
];

const GALLERY_COL_2 = [
  { src: "/album/3.jpg", alt: "Team Assembly & Prototyping" },
  { src: "/album/4.jpg", alt: "Field Testing & Autonomous Flight" },
  { src: "/album/6.jpg", alt: "Hackathon Sprint & Neural AI" },
  { src: "/why-join/why_join_tee_black.jpg", alt: "Official Club Engineering Gear" },
  { src: "/album/7.jpg", alt: "Research Presentations & Community" },
];

export default function RegistrationPage({ onBack, onOpenAdmin }) {
  const [animateIn, setAnimateIn] = useState(false);
  const closeTimer = useRef(null);

  const handleClose = useCallback(() => {
    if (closeTimer.current) return;
    setAnimateIn(false);
    closeTimer.current = setTimeout(onBack, 380);
  }, [onBack]);

  // Smooth appearing animation on mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });

    const raf = requestAnimationFrame(() => setAnimateIn(true));
    return () => { cancelAnimationFrame(raf); clearTimeout(closeTimer.current); };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose]);

  return (
    <div className={`reg-nav-overlay ${animateIn ? "is-visible" : ""}`}>
      {/* Topographic Background Contour Vector — Light Mode */}
      <div className="reg-nav-topography" aria-hidden="true">
        <svg viewBox="0 0 1440 900" fill="none" preserveAspectRatio="xMidYMid slice">
          <path
            d="M-100 200 C 200 150, 400 350, 700 250 C 1000 150, 1200 400, 1600 300"
            stroke="rgba(37, 99, 235, 0.12)"
            strokeWidth="1.5"
          />
          <path
            d="M-80 320 C 250 260, 450 480, 800 360 C 1100 240, 1300 520, 1650 420"
            stroke="rgba(15, 23, 42, 0.06)"
            strokeWidth="1.5"
          />
          <path
            d="M-50 450 C 300 380, 500 600, 850 480 C 1150 360, 1350 640, 1700 550"
            stroke="rgba(37, 99, 235, 0.10)"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      {/* Top Header Bar — Exactly the same size, padding, and place as the other pages */}
      <header className="reg-nav-header-bar">
        <div className="header-left">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              handleClose();
            }}
            className="nav-brand-link"
            aria-label="RAI Robotics Home"
          >
            <img
              src="RAI/club-icon-light.png"
              alt="RAI Robotics Logo"
              height={70}
              className="nav-brand-logo"
            />
          </a>
        </div>

        <div className="header-right">
          {/* Morphing X button in Light Mode (Exact same size and position as 3-dash button) */}
          <button
            type="button"
            className="reg-btn-header-close"
            onClick={handleClose}
            aria-label="Close and return to website"
            title="Return to Website"
          >
            <span className="dash-bar close-bar-1" />
            <span className="dash-bar close-bar-2" />
          </button>
        </div>
      </header>

      <main className="reg-nav-body">
        <div className="reg-nav-left-content">
          <RegistrationForm />
        </div>

        {/* RIGHT COLUMN: Two Columns in an Infinite Marquee Loop (3:4 ratio, frameless) */}
        <div className="reg-nav-right-gallery">
          <div className="reg-nav-infinite-columns">
            {/* Column 1: Infinite Loop Track Up */}
            <div className="infinite-col col-up">
              <div className="infinite-col-track">
                {[...GALLERY_COL_1, ...GALLERY_COL_1].map((img, idx) => (
                  <div key={idx} className="reg-nav-img-card">
                    <div className="reg-nav-img-wrapper">
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
                  <div key={idx} className="reg-nav-img-card">
                    <div className="reg-nav-img-wrapper">
                      <img src={img.src} alt={img.alt} loading="lazy" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* The Exact Same Website Footer Component */}
      <Footer
        onOpenAdmin={onOpenAdmin}
        onNavigateRegister={() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );
}
