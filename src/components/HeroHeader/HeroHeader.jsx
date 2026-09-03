import React, { useState } from "react";
import FullNavMenu from "../FullNavMenu/FullNavMenu";

export default function HeroHeader({ headerRef, onNavigateRegister }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleJoinClick = (e) => {
    e.preventDefault();
    if (onNavigateRegister) {
      onNavigateRegister();
    } else {
      window.location.hash = "register";
    }
  };

  return (
    <>
      <header ref={headerRef} className={`hero-transition-header ${isMenuOpen ? "is-menu-open is-dark" : ""}`}>
        <div className="header-left">
          <a href="/" className="nav-brand-link" aria-label="RAI Robotics Home">
            <img src="RAI/club-icon-light.png" alt="RAI Robotics Logo" height={70} className="nav-brand-logo" />
          </a>
        </div>

        <div className="header-right">
          <a
            href="#register"
            onClick={handleJoinClick}
            className="btn-book-demo"
            role="button"
            aria-label="Join Robotics & AI Club"
          >
            <span>Join Us</span>
            <svg className="icon-arrow-up-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
          </a>

          {/* 3-Dash Button — stays in the same place and morphs to 'X' to close menu */}
          <button
            type="button"
            className={`btn-header-hamburger ${isMenuOpen ? "is-open" : ""}`}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            title={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          >
            <span className="dash-bar dash-bar-1" />
            <span className="dash-bar dash-bar-2" />
            <span className="dash-bar dash-bar-3" />
          </button>
        </div>
      </header>

      {/* Fullscreen Editorial Navigation Overlay */}
      <FullNavMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onNavigateRegister={onNavigateRegister}
      />
    </>
  );
}

