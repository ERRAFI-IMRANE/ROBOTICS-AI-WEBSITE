import React from "react";
import "./Footer.css";

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

  return (
    <footer className="club-footer">
      <div className="footer-container">
        {/* Top Section: Brand + Links */}
        <div className="footer-top">
          {/* Brand Info */}
          <div className="footer-brand-col">
            <div className="footer-logo-row">
              <img
                src="/RAI/club-icon-light.png"
                alt="Robotics & AI Club"
                className="footer-logo-img"
              />
              <span className="footer-brand-name">ROBOTICS & AI CLUB</span>
            </div>
            <p className="footer-brand-desc">
              Innovating at the intersection of robotics, embedded systems, and artificial intelligence at École Supérieure de Technologie de Safi.
            </p>
            <div className="footer-affiliation">
              <span>EST SAFI &bull; UNIVERSITÉ CADI AYYAD</span>
            </div>
          </div>

          {/* Quick Navigation Links */}
          <div className="footer-links-col">
            <h4 className="footer-col-title">Navigation</h4>
            <ul className="footer-nav-list">
              <li><a href="#about">About Club</a></li>
              <li><a href="#events">Events & Workshops</a></li>
              <li><a href="#rai">Innovations</a></li>
              <li><a href="#team">Leadership Team</a></li>
              <li><a href="#why-join">Why Join Us</a></li>
            </ul>
          </div>

          {/* Community & Socials */}
          <div className="footer-links-col">
            <h4 className="footer-col-title">Community</h4>
            <ul className="footer-nav-list">
              <li>
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>
              </li>
              <li>
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer">
                  LinkedIn
                </a>
              </li>
              <li>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                  GitHub
                </a>
              </li>
              <li>
                <a href="mailto:contact@robotics-ai-ests.ma">
                  Email Us
                </a>
              </li>
            </ul>
          </div>

          {/* Admin / Portal Access */}
          <div className="footer-links-col footer-admin-col">
            <h4 className="footer-col-title">Management</h4>
            <p className="footer-admin-desc">
              Club officers and administrators portal for events and roster control.
            </p>
            <button
              type="button"
              className="footer-admin-btn"
              onClick={handleAdminClick}
            >
              <svg className="footer-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Admin Portal</span>
            </button>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Subtle Status */}
        <div className="footer-bottom">
          <p className="footer-copyright">
            &copy; {currentYear} Robotics and AI Club &bull; All Rights Reserved.
          </p>
          <div className="footer-status-pill">
            <span className="status-indicator" />
            <span>ESTS CAMPUS ACTIVE</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
