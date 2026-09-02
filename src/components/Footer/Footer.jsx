import React from "react";
import { RevealHeadingLine } from "../common/TextAnimations";
import "./Footer.css";

const SPONSOR_LOGOS = [
  { id: "ests", name: "EST Safi", src: "/partners/estsLight.png" },
  { id: "uca", name: "UCA Marrakech", src: "/partners/ucaLight.png" },
  { id: "a4c", name: "A4C Africa", src: "/partners/a4cLight.png" },
  { id: "ocp", name: "OCP Group", src: "/partners/OCP.png" },
  { id: "renault", name: "Renault Group", src: "/partners/Renault.png" },
  { id: "gps", name: "GPS", src: "/partners/GPS.png" },
];

export default function Footer({ onOpenAdmin }) {
  const currentYear = new Date().getFullYear();

  const handleAdminClick = (e) => {
    e.preventDefault();
    if (onOpenAdmin) {
      onOpenAdmin();
    } else {
      window.location.hash = "admin";
    }
  };

  const handleScrollTo = (e, id) => {
    e.preventDefault();
    const el = document.querySelector(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="hf-section">
      {/* SVG ClipPath Definition for the Raised Tab Container with Concave Fillets */}
      <svg width="0" height="0" className="hf-clip-svg-def" aria-hidden="true">
        <defs>
          <clipPath id="hf-raised-tab-clip" clipPathUnits="objectBoundingBox">
            <path d="M 0.33,0.044 C 0.355,0.044 0.37,0.028 0.38,0.015 C 0.39,0.005 0.398,0 0.41,0 L 0.59,0 C 0.602,0 0.61,0.005 0.62,0.015 C 0.63,0.028 0.645,0.044 0.67,0.044 L 0.985,0.044 C 0.993,0.044 1,0.054 1,0.07 L 1,0.93 C 1,0.946 0.993,0.956 0.985,0.956 L 0.76,0.956 C 0.735,0.956 0.72,0.972 0.71,0.985 C 0.70,0.995 0.692,1 0.67,1 L 0.33,1 C 0.308,1 0.30,0.995 0.29,0.985 C 0.28,0.972 0.265,0.956 0.24,0.956 L 0.015,0.956 C 0.007,0.956 0,0.946 0,0.93 L 0,0.07 C 0,0.054 0.007,0.044 0.015,0.044 Z" />
          </clipPath>
        </defs>
      </svg>

      {/* Elevated Panel with Raised Tab Top Outline */}
      <div className="hf-panel">
        {/* Decorative low-opacity topographic / circuit texture */}
        <svg
          className="hf-topo-texture"
          viewBox="0 0 1440 750"
          fill="none"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M-40,120 C260,60 460,230 760,140 C1060,50 1260,200 1480,110"
            stroke="rgba(59, 130, 246, 0.09)"
            strokeWidth="1.2"
          />
          <path
            d="M-40,250 C240,170 440,340 740,260 C1040,180 1300,310 1480,220"
            stroke="rgba(59, 130, 246, 0.06)"
            strokeWidth="1.2"
          />
          <path
            d="M-40,390 C200,300 560,460 860,360 C1160,260 1360,400 1480,330"
            stroke="rgba(255, 255, 255, 0.03)"
            strokeWidth="1"
          />
          <path
            d="M240,50 C400,110 600,40 800,90 C1000,140 1200,60 1440,110"
            stroke="rgba(37, 99, 235, 0.08)"
            strokeWidth="1"
          />
        </svg>

        <div className="hf-panel-content">
          {/* HERO: Slogan Headline with Ambient Glow & Mask Reveal */}
          <div className="hf-hero-block">
            <div className="hf-hero-glow" aria-hidden="true" />
            <h2 className="hf-headline">
              <RevealHeadingLine delay={0} className="hf-headline-row">
                <span className="hf-headline-bold">ALWAYS </span>
                <span className="hf-headline-alt">INNOVATING</span>
              </RevealHeadingLine>
              <RevealHeadingLine delay={100} className="hf-headline-row">
                <span className="hf-headline-bold">THE </span>
                <span className="hf-headline-alt hf-headline-accent">FUTURE.</span>
              </RevealHeadingLine>
            </h2>
          </div>

          {/* MAIN STAGE: Left Pages Column, Center Robot Image, Right Follow Column */}
          <div className="hf-stage-grid">
            {/* Left Column: Pages */}
            <div className="hf-col hf-col--left">
              <span className="hf-eyebrow">PAGES</span>
              <ul className="hf-nav-list">
                <li>
                  <a
                    href="#events"
                    onClick={(e) => handleScrollTo(e, "#events")}
                    className="anim-link-underline"
                  >
                    EVENTS
                  </a>
                </li>
                <li>
                  <a
                    href="#team"
                    onClick={(e) => handleScrollTo(e, "#team")}
                    className="anim-link-underline"
                  >
                    TEAM
                  </a>
                </li>
                <li>
                  <a
                    href="#partners"
                    onClick={(e) => handleScrollTo(e, "#partners")}
                    className="anim-link-underline"
                  >
                    PARTNERS
                  </a>
                </li>
              </ul>
              <div className="hf-accent-link-wrap">
                <a
                  href="#why-join"
                  onClick={(e) => handleScrollTo(e, "#why-join")}
                  className="hf-accent-link anim-link-underline"
                >
                  JOIN US
                </a>
              </div>
            </div>

            {/* Center Robot Image (Front-facing, Head-on, Bleeds to bottom) */}
            <div className="hf-robot-center">
              <div className="hf-robot-frame">
                <img
                  src="/RAI/RAI FRONT.png"
                  alt="Robotics & AI Robot Head-on"
                  className="hf-robot-img"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Right Column: Follow us */}
            <div className="hf-col hf-col--right">
              <span className="hf-eyebrow">FOLLOW US</span>
              <ul className="hf-nav-list hf-social-list">
                <li>
                  <a
                    href="https://www.tiktok.com/@robotics.ai.club"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="anim-link-underline"
                  >
                    TIKTOK
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.instagram.com/robotics_aiclub.ests/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="anim-link-underline"
                  >
                    INSTAGRAM
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.linkedin.com/in/robotics-ai-club/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="anim-link-underline"
                  >
                    LINKEDIN
                  </a>
                </li>
                <li>
                  <a
                    href="https://discord.gg/GdDsZjJTF"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="anim-link-underline"
                  >
                    DISCORD
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Infinite Loop Partner Marquee (Flows seamlessly behind the robot mascot) */}
          <div className="hf-marquee-container" aria-label="Sponsors and Partners">
            <div className="hf-marquee-track">
              {[...SPONSOR_LOGOS, ...SPONSOR_LOGOS, ...SPONSOR_LOGOS, ...SPONSOR_LOGOS].map((partner, idx) => (
                <div key={`${partner.id}-${idx}`} className="hf-partner-item">
                  <img
                    src={partner.src}
                    alt={partner.name}
                    className="hf-partner-logo"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM BAR (Outside the container on the blue gradient background) */}
      <div className="hf-bottom-bar">
        <p className="hf-copyright">
          &copy; {currentYear} Robotics &amp; AI Club. All rights reserved
        </p>

        <div className="hf-legal-links">
          <a
            href="#about"
            onClick={(e) => handleScrollTo(e, "#about")}
            className="hf-legal-link anim-link-underline"
          >
            Privacy
          </a>
          <span className="hf-legal-dot">&middot;</span>
          <a
            href="#why-join"
            onClick={(e) => handleScrollTo(e, "#why-join")}
            className="hf-legal-link anim-link-underline"
          >
            Terms
          </a>
          <span className="hf-legal-dot">&middot;</span>
          <button
            type="button"
            className="hf-admin-btn anim-link-underline"
            onClick={handleAdminClick}
            title="Open Admin Dashboard"
          >
            Admin
          </button>
        </div>
      </div>
    </footer>
  );
}
