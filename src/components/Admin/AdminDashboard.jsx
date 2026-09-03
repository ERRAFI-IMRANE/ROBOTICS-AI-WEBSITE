import React, { useState, useEffect, Component } from "react";
import AdminAnalytics from "./AdminAnalytics";
import AdminEvents from "./AdminEvents";
import AdminTeam from "./AdminTeam";
import AdminMembers from "./AdminMembers";
import "./AdminDashboard.css";

class AdminErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Admin tab error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="admin-tab-content">
          <div
            className="admin-panel"
            style={{
              textAlign: "center",
              padding: "40px 20px",
              maxWidth: "560px",
              margin: "40px auto",
              border: "1px solid var(--critical)",
            }}
          >
            <h3 style={{ color: "var(--critical)", margin: "0 0 8px", fontSize: "16px" }}>
              Panel Render Notice
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 16px" }}>
              {this.state.error?.message || "An unexpected error occurred while loading this view."}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Retry loading view
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AdminDashboard({ onClose }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem("rai_admin_auth") === "true";
  });
  const [passcode, setPasscode] = useState("");
  const [authError, setAuthError] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [isRailExpanded, setIsRailExpanded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("rai_admin_theme") === "dark" ||
      (!localStorage.getItem("rai_admin_theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  // Apply dark mode class to root
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("rai_admin_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("rai_admin_theme", "light");
    }
  }, [isDarkMode]);

  const handleToggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    const trimmed = passcode.trim().toLowerCase();
    if (trimmed === "admin2025" || trimmed === "rai2025" || trimmed === "ests" || trimmed === "admin") {
      sessionStorage.setItem("rai_admin_auth", "true");
      setIsAuthenticated(true);
      setAuthError(false);
    } else {
      setAuthError(true);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("rai_admin_auth");
    setIsAuthenticated(false);
    onClose();
  };

  // Standalone Auth Screen (Drafting table calibration style)
  if (!isAuthenticated) {
    return (
      <div className={`admin-root-layout admin-auth-screen-layout ${isDarkMode ? "dark" : ""}`}>
        <div className="admin-auth-card-standalone">
          <div className="admin-auth-mark">
            <div className="admin-auth-mark-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 12h10M12 7v10" />
              </svg>
            </div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "14px" }}>
              Robotics & AI Club
            </span>
          </div>

          <h1 className="admin-auth-title">Console access</h1>
          <p className="admin-auth-subtitle">
            Enter authorized club officer passcode to unlock telemetry and controls.
          </p>

          <form onSubmit={handleLoginSubmit} className="admin-auth-standalone-form">
            <div className="admin-auth-input-wrapper">
              <label className="admin-auth-label">Officer passcode</label>
              <input
                type="password"
                className={`admin-standalone-input ${authError ? "has-error" : ""}`}
                placeholder="Passcode (default: admin2025)"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (authError) setAuthError(false);
                }}
                autoFocus
              />
              {authError && (
                <span className="admin-standalone-error">
                  Invalid authentication passcode.
                </span>
              )}
            </div>

            <div className="admin-auth-btn-row">
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>
                Return to website
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 1.3 }}>
                Unlock console
              </button>
            </div>
          </form>

          <div className="admin-auth-footer-hint">
            <span>EST Safi &bull; Control panel</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>v2.4.0</span>
          </div>
        </div>
      </div>
    );
  }

  // Navigation Items Specification
  const navSections = [
    {
      id: "overview",
      label: "Overview",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      ),
    },
    {
      id: "team",
      label: "Team",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      id: "members",
      label: "Members",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      ),
    },
    {
      id: "events",
      label: "Events",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      id: "projects",
      label: "Projects",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      ),
    },
    {
      id: "inventory",
      label: "Inventory",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
    },
    {
      id: "budget",
      label: "Budget",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      id: "settings",
      label: "Settings",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  const currentTabLabel = navSections.find((s) => s.id === activeTab)?.label || "Overview";

  return (
    <div className={`admin-root-layout ${isDarkMode ? "dark" : ""}`}>
      {/* Left Rail Navigation (72px collapsed / 240px expanded) */}
      <aside className={`admin-rail ${isRailExpanded ? "is-expanded" : "is-collapsed"}`}>
        <div className="admin-rail-top">
          {/* Header & Rail Toggle */}
          <div className="admin-rail-header">
            <button
              type="button"
              className="admin-rail-brand-mark"
              onClick={() => setIsRailExpanded((v) => !v)}
              title="Toggle rail expansion"
            >
              RAI
            </button>
            {isRailExpanded && (
              <div className="admin-rail-brand-meta">
                <span className="admin-rail-brand-title">Robotics & AI Club</span>
                <span className="admin-rail-brand-sub">EST Safi console</span>
              </div>
            )}
          </div>

          {/* Navigation Sections */}
          <nav className="admin-rail-nav">
            {navSections.map((sec) => {
              const isActive = activeTab === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  className={`admin-rail-item ${isActive ? "is-active" : ""}`}
                  onClick={() => setActiveTab(sec.id)}
                  title={sec.label}
                >
                  {sec.icon}
                  {isRailExpanded && <span>{sec.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Rail Footer */}
        <div className="admin-rail-footer">
          <button
            type="button"
            className="rail-toggle-btn"
            onClick={() => setIsRailExpanded((v) => !v)}
            title={isRailExpanded ? "Collapse rail" : "Expand rail"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isRailExpanded ? (
                <polyline points="11 19 4 12 11 5" />
              ) : (
                <polyline points="13 5 20 12 13 19" />
              )}
            </svg>
            {isRailExpanded && <span>Collapse sidebar</span>}
          </button>
        </div>
      </aside>

      {/* Main Viewport */}
      <main className="admin-main-viewport">
        {/* Top Bar (56px) */}
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <div className="admin-topbar-mark">
              <span className="mark-bracket">[</span>
              <span>RAI</span>
              <span className="mark-bracket">]</span>
            </div>
            <span className="topbar-breadcrumb-sep">/</span>
            <span className="topbar-breadcrumb-item">Console</span>
            <span className="topbar-breadcrumb-sep">/</span>
            <span className="topbar-breadcrumb-current">{currentTabLabel}</span>
          </div>

          <div className="admin-topbar-right">
            {/* Topbar Search */}
            <div className="topbar-search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                className="topbar-search-input"
              />
            </div>

            {/* Theme Toggle (Light Drafting / Dark Oscilloscope) */}
            <button
              type="button"
              className="topbar-icon-btn"
              onClick={handleToggleTheme}
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="theme-toggle-icon">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="theme-toggle-icon">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Settings Quick Shortcut */}
            <button
              type="button"
              className="topbar-icon-btn"
              onClick={() => setActiveTab("settings")}
              title="Console settings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {/* View Public Website */}
            <button
              type="button"
              className="topbar-view-site-btn"
              onClick={onClose}
              title="Return to public website"
            >
              <span>Public site</span>
            </button>

            {/* Officer Profile Badge */}
            <div className="topbar-user-badge">
              <span className="user-avatar-initials">IE</span>
              <span className="user-name-text">Imrane Errafi</span>
            </div>

            {/* Lock / Exit */}
            <button
              type="button"
              className="topbar-icon-btn"
              onClick={handleLogout}
              title="Lock and exit console"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </button>
          </div>
        </header>

        {/* Dynamic Tab Views */}
        <AdminErrorBoundary key={activeTab}>
          {activeTab === "overview" && <AdminAnalytics eventsCount={12} membersCount={118} />}
          {activeTab === "team" && <AdminTeam />}
          {activeTab === "members" && <AdminMembers />}
          {activeTab === "events" && <AdminEvents />}

          {/* Active Projects View */}
          {activeTab === "projects" && (
            <div className="admin-tab-content">
              <div className="admin-view-header">
                <div>
                  <h1 className="admin-page-title">Engineering projects</h1>
                  <p className="admin-page-desc">Autonomous systems, drone firmware, and embedded AI builds.</p>
                </div>
                <div className="admin-header-actions">
                  <button type="button" className="btn-primary">Add project</button>
                </div>
              </div>

            <div className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <h3 className="admin-panel-heading">Active builds (4)</h3>
                  <p className="admin-panel-meta">Technical tracking and subsystem readiness</p>
                </div>
              </div>

              <div className="table-container">
                <table className="hairline-table">
                  <thead>
                    <tr>
                      <th>Project code</th>
                      <th>Platform name</th>
                      <th>Subsystem track</th>
                      <th>Project lead</th>
                      <th>Status</th>
                      <th className="col-numeric">Budget</th>
                      <th>Milestone date</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>PRJ-01</td>
                      <td style={{ fontWeight: 500 }}>Autonomous Rover V4</td>
                      <td>Computer vision & obstacle avoidance</td>
                      <td>Imrane Errafi</td>
                      <td>
                        <span className="status-chip status-chip-positive">
                          <span className="status-chip-dot" />
                          <span>Active</span>
                        </span>
                      </td>
                      <td className="col-numeric">$1,200</td>
                      <td>15 Apr 2025</td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>PRJ-02</td>
                      <td style={{ fontWeight: 500 }}>ROS2 Quadcopter</td>
                      <td>PX4 flight controller & GPS telemetry</td>
                      <td>Aya Mansouri</td>
                      <td>
                        <span className="status-chip status-chip-positive">
                          <span className="status-chip-dot" />
                          <span>Active</span>
                        </span>
                      </td>
                      <td className="col-numeric">$850</td>
                      <td>28 Mar 2025</td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>PRJ-03</td>
                      <td style={{ fontWeight: 500 }}>Smart Agribot</td>
                      <td>Soil analysis & edge camera model</td>
                      <td>Mehdi Alami</td>
                      <td>
                        <span className="status-chip status-chip-warning">
                          <span className="status-chip-dot" />
                          <span>Planning</span>
                        </span>
                      </td>
                      <td className="col-numeric">$620</td>
                      <td>10 May 2025</td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>PRJ-04</td>
                      <td style={{ fontWeight: 500 }}>Bipedal Walking Platform</td>
                      <td>Inverse kinematics & high-torque servos</td>
                      <td>Yassine Berrada</td>
                      <td>
                        <span className="status-chip status-chip-critical">
                          <span className="status-chip-dot" />
                          <span>Blocked</span>
                        </span>
                      </td>
                      <td className="col-numeric">$1,450</td>
                      <td>02 Jun 2025</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Inventory View */}
        {activeTab === "inventory" && (
          <div className="admin-tab-content">
            <div className="admin-view-header">
              <div>
                <h1 className="admin-page-title">Hardware lab inventory</h1>
                <p className="admin-page-desc">Microcontrollers, sensors, motors, and electronic test gear.</p>
              </div>
              <div className="admin-header-actions">
                <button type="button" className="btn-primary">Add component</button>
              </div>
            </div>

            <div className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <h3 className="admin-panel-heading">Component stock registry</h3>
                  <p className="admin-panel-meta">Lab benches 1–4 stock level telemetry</p>
                </div>
              </div>

              <div className="table-container">
                <table className="hairline-table">
                  <thead>
                    <tr>
                      <th>Part number</th>
                      <th>Component description</th>
                      <th>Category</th>
                      <th>Bench location</th>
                      <th>Status</th>
                      <th className="col-numeric">In stock</th>
                      <th className="col-numeric">Min threshold</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>MCU-ESP32-S3</td>
                      <td style={{ fontWeight: 500 }}>ESP32-S3 Dual-Core WiFi/BLE</td>
                      <td>Microcontroller</td>
                      <td>Bench 1 &bull; Bin A4</td>
                      <td>
                        <span className="status-chip status-chip-positive">
                          <span className="status-chip-dot" />
                          <span>Nominal</span>
                        </span>
                      </td>
                      <td className="col-numeric">24</td>
                      <td className="col-numeric">10</td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>SBC-RPI-4B-4G</td>
                      <td style={{ fontWeight: 500 }}>Raspberry Pi 4 Model B (4GB)</td>
                      <td>Single Board Computer</td>
                      <td>Bench 1 &bull; Bin B2</td>
                      <td>
                        <span className="status-chip status-chip-warning">
                          <span className="status-chip-dot" />
                          <span>Low stock</span>
                        </span>
                      </td>
                      <td className="col-numeric">3</td>
                      <td className="col-numeric">5</td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>SEN-LIDAR-A1M8</td>
                      <td style={{ fontWeight: 500 }}>RPLIDAR A1 360° 12m Scanner</td>
                      <td>Sensor / Lidar</td>
                      <td>Bench 2 &bull; Cabinet 1</td>
                      <td>
                        <span className="status-chip status-chip-positive">
                          <span className="status-chip-dot" />
                          <span>Nominal</span>
                        </span>
                      </td>
                      <td className="col-numeric">6</td>
                      <td className="col-numeric">2</td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>MOT-MG996R-SRV</td>
                      <td style={{ fontWeight: 500 }}>MG996R High-Torque Metal Gear Servo</td>
                      <td>Actuators</td>
                      <td>Bench 3 &bull; Bin D1</td>
                      <td>
                        <span className="status-chip status-chip-positive">
                          <span className="status-chip-dot" />
                          <span>Nominal</span>
                        </span>
                      </td>
                      <td className="col-numeric">42</td>
                      <td className="col-numeric">15</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Budget View */}
        {activeTab === "budget" && (
          <div className="admin-tab-content">
            <div className="admin-view-header">
              <div>
                <h1 className="admin-page-title">Equipment budget & grants</h1>
                <p className="admin-page-desc">Financial allocations, university grants, and component purchases.</p>
              </div>
              <div className="admin-header-actions">
                <button type="button" className="btn-primary">Log transaction</button>
              </div>
            </div>

            <div className="data-metrics-grid">
              <div className="data-metric-panel">
                <span className="metric-label">Total allocated budget</span>
                <div className="metric-readout-row">
                  <span className="metric-readout">$7,500</span>
                  <span className="metric-delta delta-positive">Annual grant</span>
                </div>
                <span className="metric-subtext">2024-2025 academic funding</span>
              </div>
              <div className="data-metric-panel">
                <span className="metric-label">Disbursed funds</span>
                <div className="metric-readout-row">
                  <span className="metric-readout">$4,850</span>
                  <span className="metric-delta delta-positive">64.6% utilized</span>
                </div>
                <span className="metric-subtext">Components & competition registration</span>
              </div>
              <div className="data-metric-panel">
                <span className="metric-label">Available balance</span>
                <div className="metric-readout-row">
                  <span className="metric-readout">$2,650</span>
                  <span className="metric-delta delta-positive">Available</span>
                </div>
                <span className="metric-subtext">Remaining contingency reserve</span>
              </div>
              <div className="data-metric-panel">
                <span className="metric-label">Sponsorship partnerships</span>
                <div className="metric-readout-row">
                  <span className="metric-readout">03</span>
                  <span className="metric-delta delta-positive">Active</span>
                </div>
                <span className="metric-subtext">Industrial partners at Safi</span>
              </div>
            </div>

            <div className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <h3 className="admin-panel-heading">Recent ledger transactions</h3>
                  <p className="admin-panel-meta">Approved equipment and travel reimbursements</p>
                </div>
              </div>

              <div className="table-container">
                <table className="hairline-table">
                  <thead>
                    <tr>
                      <th>Ref code</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Authorization</th>
                      <th>Date</th>
                      <th className="col-numeric">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>TX-2025-014</td>
                      <td style={{ fontWeight: 500 }}>Jetson Orin Nano Developer Kit (2x)</td>
                      <td>Embedded Hardware</td>
                      <td>Supervisor approval</td>
                      <td>12 Feb 2025</td>
                      <td className="col-numeric" style={{ color: "var(--critical)" }}>-$980.00</td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>TX-2025-013</td>
                      <td style={{ fontWeight: 500 }}>University Innovation Grant Tranche 2</td>
                      <td>Grant Inflow</td>
                      <td>EST Safi Administration</td>
                      <td>01 Feb 2025</td>
                      <td className="col-numeric" style={{ color: "var(--positive)" }}>+$2,500.00</td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>TX-2025-012</td>
                      <td style={{ fontWeight: 500 }}>3D Printing Filament PLA+ (10kg spool)</td>
                      <td>Prototyping Consumables</td>
                      <td>President approval</td>
                      <td>20 Jan 2025</td>
                      <td className="col-numeric" style={{ color: "var(--critical)" }}>-$220.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Settings View */}
        {activeTab === "settings" && (
          <div className="admin-tab-content">
            <div className="admin-view-header">
              <div>
                <h1 className="admin-page-title">Console settings</h1>
                <p className="admin-page-desc">Club parameters, season management, and authentication keys.</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="admin-panel">
                <h3 className="admin-panel-heading" style={{ marginBottom: "6px" }}>Academic season</h3>
                <p className="admin-panel-meta" style={{ marginBottom: "16px" }}>Current active season for roster and competition scoring</p>

                <div className="form-field-group" style={{ marginBottom: "14px" }}>
                  <label className="form-field-label">Active season</label>
                  <select className="form-select-input" defaultValue="25-26">
                    <option value="26-27">26-27 (Upcoming)</option>
                    <option value="25-26">25-26 (Active)</option>
                    <option value="24-25">24-25 (Archived)</option>
                  </select>
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">Default club department</label>
                  <input
                    type="text"
                    defaultValue="École Supérieure de Technologie de Safi"
                    className="form-text-input"
                    disabled
                  />
                </div>
              </div>

              <div className="admin-panel">
                <h3 className="admin-panel-heading" style={{ marginBottom: "6px" }}>Database telemetry</h3>
                <p className="admin-panel-meta" style={{ marginBottom: "16px" }}>Supabase PostgREST connection status</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "4px" }}>
                    <span style={{ fontSize: "13px" }}>Supabase PostgreSQL</span>
                    <span className="status-chip status-chip-positive">
                      <span className="status-chip-dot" />
                      <span>Connected</span>
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "4px" }}>
                    <span style={{ fontSize: "13px" }}>Team table RPC</span>
                    <span className="status-chip status-chip-positive">
                      <span className="status-chip-dot" />
                      <span>Online</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </AdminErrorBoundary>
      </main>
    </div>
  );
}
