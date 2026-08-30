import React from "react";
import "./WhyJoinSection.css";

export default function WhyJoinSection() {
  return (
    <section id="why-join" className="why-join-section">
      {/* Topographic Background Contour Lines */}
      <div className="why-join-topo-bg" aria-hidden="true">
        <svg viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
          <path
            d="M-100,180 C260,80 580,320 920,160 C1220,-20 1520,240 1850,110"
            stroke="rgba(26, 28, 35, 0.05)"
            strokeWidth="1.4"
          />
          <path
            d="M-100,420 C220,280 540,540 980,310 C1280,120 1560,450 1860,260"
            stroke="rgba(26, 28, 35, 0.06)"
            strokeWidth="1.2"
            strokeDasharray="8 8"
          />
          <path
            d="M-100,680 C320,520 640,740 1060,560 C1360,380 1640,680 1960,500"
            stroke="rgba(26, 28, 35, 0.05)"
            strokeWidth="1.4"
          />
          <path
            d="M-100,850 C360,700 680,900 1100,720 C1400,540 1680,820 1980,660"
            stroke="rgba(26, 28, 35, 0.04)"
            strokeWidth="1.2"
          />
        </svg>
      </div>

      <div className="why-join-container">
        {/* Left Content Column */}
        <div className="why-join-left">
          {/* Tag Pill with Icon */}
          <div className="why-join-tag">
            <svg
              className="why-join-tag-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span>WHY JOIN OUR CLUB</span>
          </div>

          {/* Large High-Contrast Headline */}
          <h2 className="why-join-headline">
            <span className="headline-line-part">BUILD REAL</span>
            <span className="headline-line-part">AI & ROBOTICS</span>
            <span className="headline-line-part headline-line-blue">INNOVATIONS</span>
          </h2>

          {/* Description Paragraph */}
          <p className="why-join-description">
            Step into Morocco&apos;s leading student robotics & artificial intelligence hub at EST Safi. Build autonomous systems, design neural architectures, compete in national hackathons, and turn theoretical ideas into tangible real-world engineering.
          </p>

          {/* Interactive Neon Action Button */}
          <div className="why-join-cta-row">
            <a href="#join" className="why-join-btn">
              <span>JOIN THE COMMUNITY</span>
              <svg
                className="why-join-btn-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </a>
          </div>

          {/* Docked Mini Card: Black Club Merch */}
          <div className="why-join-mini-card-left">
            <img
              src="/why-join/why_join_tee_black.jpg"
              alt="RAI Club Official Gear"
              className="mini-card-img"
              loading="lazy"
            />
          </div>
        </div>

        {/* Right Visual Collage */}
        <div className="why-join-right">
          {/* Main Tall Center Visual */}
          <div className="why-join-main-media-wrap">
            <img
              src="/why-join/why_join_main.jpg"
              alt="RAI Club Student Engineer"
              className="why-join-main-img"
              loading="lazy"
            />
          </div>

          {/* Floating Card: Top Right Gold Trophy/Champions Card */}
          <div className="why-join-floating-gold-card">
            <img
              src="/why-join/why_join_gold.jpg"
              alt="Champions Edition Gold Card"
              className="gold-card-img"
              loading="lazy"
            />
          </div>

          {/* Floating Card: Bottom Center White Gear Card */}
          <div className="why-join-floating-white-card">
            <img
              src="/why-join/why_join_tee_white.jpg"
              alt="RAI Cybernetic Armor Edition"
              className="white-card-img"
              loading="lazy"
            />
          </div>

          {/* Club Sign Image from public/RAI/ */}
          <div className="why-join-club-sign-wrap">
            <img
              src="/RAI/club sign.png"
              alt="Robotics & AI Club Sign"
              className="why-join-club-sign-img"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
