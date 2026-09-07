import React, { useState, useEffect, Component } from "react";
import AdminAnalytics from "./AdminAnalytics";
import AdminEvents from "./AdminEvents";
import AdminTeam from "./AdminTeam";
import AdminMembers from "./AdminMembers";
import AdminSettings from "./AdminSettings";
import { supabase } from "../../lib/supabaseClient";
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
              maxWidth: "540px",
              margin: "40px auto",
              border: "1px solid var(--critical)",
            }}
          >
            <h3 style={{ color: "var(--critical)", margin: "0 0 8px", fontSize: "16px", fontFamily: "var(--font-display)" }}>
              Tab render notice
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;
    function applySession(session) {
      if (!active) return;
      setIsAuthenticated(session?.user?.app_metadata?.club_admin === true);
      setAuthLoading(false);
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error && active) setAuthError("Could not restore your session. Please sign in.");
      applySession(data?.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const [activeTab, setActiveTab] = useState("overview");
  const [isRailExpanded, setIsRailExpanded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return (
      localStorage.getItem("rai_admin_theme") === "dark" ||
      (!localStorage.getItem("rai_admin_theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  });

  // Apply dark mode state
  useEffect(() => {
    if (isDarkMode) {
      localStorage.setItem("rai_admin_theme", "dark");
    } else {
      localStorage.setItem("rai_admin_theme", "light");
    }
  }, [isDarkMode]);

  const handleToggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: passcode,
      });
      if (error) throw new Error("Unable to sign in. Check your email and password.");
      if (data.user?.app_metadata?.club_admin !== true) {
        await supabase.auth.signOut();
        throw new Error("This account does not have club officer access.");
      }
      setPasscode("");
      setIsAuthenticated(true);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      window.alert("Could not sign out. Please try again.");
      return;
    }
    setIsAuthenticated(false);
    onClose();
  };

  // 1. Standalone Auth Screen (High-polish SaaS card)
  if (!isAuthenticated) {
    return (
      <div className={`admin-root-layout admin-auth-screen-layout ${isDarkMode ? "dark" : ""}`}>
        <div className="admin-auth-card-standalone">
          <div className="admin-auth-mark">
            <img className="admin-login-logo" src="/RAI/club-icon-light.png" alt="Robotics & AI Club logo" />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "15px", color: "var(--text)" }}>
                Robotics & AI Club
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>EST Safi Workspace</div>
            </div>
          </div>

          <h1 className="admin-auth-title">Officer sign in</h1>
          <p className="admin-auth-subtitle">
            Enter your credentials to access the administrative command console.
          </p>

          <form onSubmit={handleLoginSubmit} className="admin-auth-standalone-form">
            <div className="admin-auth-input-wrapper">
              <label className="admin-auth-label" htmlFor="admin-email">Officer email</label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="username"
                className="admin-standalone-input"
                placeholder="officer@estsafi.ac.ma"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="admin-auth-input-wrapper">
              <label className="admin-auth-label" htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                required
                autoComplete="current-password"
                type="password"
                className={`admin-standalone-input ${authError ? "has-error" : ""}`}
                placeholder="••••••••••••"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (authError) setAuthError("");
                }}
                autoFocus
              />
              {authError && (
                <span className="admin-standalone-error" role="alert">
                  {authError}
                </span>
              )}
            </div>

            <div className="admin-auth-btn-row">
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>
                Return to site
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={authBusy || authLoading}
                style={{ flex: 1.3 }}
              >
                {authLoading ? "Checking session…" : authBusy ? "Signing in…" : "Sign in ↗"}
              </button>
            </div>
          </form>

          <div className="admin-auth-footer-hint">
            <span>EST Safi &bull; Control Center</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>v2.4.0</span>
          </div>
        </div>
      </div>
    );
  }

  // Navigation Items
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
      label: "Staff",
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
      label: "Parameters",
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
      {/* Left Rail Navigation */}
      <aside className={`admin-rail ${isRailExpanded ? "is-expanded" : "is-collapsed"}`}>
        <div className="admin-rail-top">
          <div className="admin-rail-header">
            <button
              type="button"
              className="admin-rail-brand-mark"
              onClick={() => setIsRailExpanded((v) => !v)}
              title="Toggle sidebar expansion"
            >
              <img src="/RAI/club-icon-light.png" alt="RAI" className="admin-rail-logo" />
            </button>
            {isRailExpanded && (
              <div className="admin-rail-brand-meta">
                <span className="admin-rail-brand-title">Robotics & AI Club</span>
                <span className="admin-rail-brand-sub">EST Safi console</span>
              </div>
            )}
          </div>

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
                  aria-label={sec.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  {sec.icon}
                  {isRailExpanded && <span>{sec.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="admin-rail-footer">
          <button
            type="button"
            className="rail-toggle-btn"
            onClick={() => setIsRailExpanded((v) => !v)}
            title={isRailExpanded ? "Collapse sidebar" : "Expand sidebar"}
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
        {/* Topbar */}
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <div className="admin-topbar-mark">
              <img className="admin-topbar-sign" src="/RAI/club sign.png" alt="RAI" />
            </div>
            <span className="topbar-breadcrumb-sep">/</span>
            <span className="topbar-breadcrumb-item">Console</span>
            <span className="topbar-breadcrumb-sep">/</span>
            <span className="topbar-breadcrumb-current">{currentTabLabel}</span>
          </div>

          <div className="admin-topbar-right">
            {/* Theme Toggle */}
            <button
              type="button"
              className="topbar-icon-btn"
              onClick={handleToggleTheme}
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Quick Settings */}
            <button
              type="button"
              className="topbar-icon-btn"
              onClick={() => setActiveTab("settings")}
              title="Parameters & settings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {/* Public Site Shortcut */}
            <button
              type="button"
              className="topbar-view-site-btn"
              onClick={onClose}
              title="Return to public club website"
            >
              <span>Public site ↗</span>
            </button>

            {/* Officer Profile Badge */}
            <div className="topbar-user-badge">
              <span className="user-avatar-initials">RAI</span>
              <span className="user-name-text">Club officer</span>
            </div>

            {/* Logout */}
            <button
              type="button"
              className="topbar-icon-btn"
              onClick={handleLogout}
              title="Sign out of console"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </button>
          </div>
        </header>

        {/* Tab Content Router */}
        <AdminErrorBoundary key={activeTab}>
          {activeTab === "overview" && <AdminAnalytics onNavigate={setActiveTab} />}
          {["projects", "inventory", "budget"].includes(activeTab) && (
            <div className="admin-demo-notice" role="note" style={{ margin: "16px 32px 0" }}>
              <span>Preview workspace &bull; This section contains demonstration records for technical tracking.</span>
            </div>
          )}
          {activeTab === "team" && <AdminTeam />}
          {activeTab === "members" && <AdminMembers />}
          {activeTab === "events" && <AdminEvents />}

          {/* Active Projects View */}
          {activeTab === "projects" && (
            <div className="admin-tab-content">
              <div className="admin-view-header">
                <div>
                  <p className="admin-eyebrow">RESEARCH & DEVELOPMENT</p>
                  <h1 className="admin-page-title">Engineering projects</h1>
                  <p className="admin-page-desc">Autonomous systems, drone firmware, and embedded AI builds.</p>
                </div>
                <div className="admin-header-actions">
                  <button type="button" className="btn-primary">Add project ↗</button>
                </div>
              </div>

              <div className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h3 className="admin-panel-heading">Active builds registry (4)</h3>
                    <p className="admin-panel-meta">Technical tracking and subsystem readiness telemetry</p>
                  </div>
                </div>

                <div className="table-container">
                  <table className="hairline-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Platform</th>
                        <th>Subsystem track</th>
                        <th>Lead engineer</th>
                        <th>Status</th>
                        <th className="col-numeric">Budget</th>
                        <th>Target milestone</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>PRJ-01</td>
                        <td style={{ fontWeight: 600 }}>Autonomous Rover V4</td>
                        <td>Computer vision & obstacle avoidance</td>
                        <td>Imrane Errafi</td>
                        <td>
                          <span className="status-chip status-chip-positive">
                            <span className="status-chip-dot" />
                            <span>Active</span>
                          </span>
                        </td>
                        <td className="col-numeric" style={{ fontWeight: 600 }}>$1,200</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>15 Apr 2025</td>
                      </tr>
                      <tr>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>PRJ-02</td>
                        <td style={{ fontWeight: 600 }}>ROS2 Quadcopter</td>
                        <td>PX4 flight controller & GPS telemetry</td>
                        <td>Aya Mansouri</td>
                        <td>
                          <span className="status-chip status-chip-positive">
                            <span className="status-chip-dot" />
                            <span>Active</span>
                          </span>
                        </td>
                        <td className="col-numeric" style={{ fontWeight: 600 }}>$850</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>28 Mar 2025</td>
                      </tr>
                      <tr>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>PRJ-03</td>
                        <td style={{ fontWeight: 600 }}>Smart Agribot</td>
                        <td>Soil analysis & edge camera inference</td>
                        <td>Mehdi Alami</td>
                        <td>
                          <span className="status-chip status-chip-warning">
                            <span className="status-chip-dot" />
                            <span>Planning</span>
                          </span>
                        </td>
                        <td className="col-numeric" style={{ fontWeight: 600 }}>$620</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>10 May 2025</td>
                      </tr>
                      <tr>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>PRJ-04</td>
                        <td style={{ fontWeight: 600 }}>Bipedal Walking Platform</td>
                        <td>Inverse kinematics & high-torque servos</td>
                        <td>Yassine Berrada</td>
                        <td>
                          <span className="status-chip status-chip-critical">
                            <span className="status-chip-dot" />
                            <span>Blocked</span>
                          </span>
                        </td>
                        <td className="col-numeric" style={{ fontWeight: 600 }}>$1,450</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>02 Jun 2025</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Hardware Lab Inventory View */}
          {activeTab === "inventory" && (
            <div className="admin-tab-content">
              <div className="admin-view-header">
                <div>
                  <p className="admin-eyebrow">EQUIPMENT & LAB TELEMETRY</p>
                  <h1 className="admin-page-title">Hardware lab inventory</h1>
                  <p className="admin-page-desc">Microcontrollers, sensors, motors, and electronic test gear.</p>
                </div>
                <div className="admin-header-actions">
                  <button type="button" className="btn-primary">Add component ↗</button>
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
                        <td style={{ fontWeight: 600 }}>ESP32-S3 Dual-Core WiFi/BLE</td>
                        <td>Microcontroller</td>
                        <td>Bench 1 &bull; Bin A4</td>
                        <td>
                          <span className="status-chip status-chip-positive">
                            <span className="status-chip-dot" />
                            <span>Nominal</span>
                          </span>
                        </td>
                        <td className="col-numeric" style={{ fontWeight: 600 }}>24</td>
                        <td className="col-numeric" style={{ color: "var(--text-muted)" }}>10</td>
                      </tr>
                      <tr>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>SBC-RPI-4B-4G</td>
                        <td style={{ fontWeight: 600 }}>Raspberry Pi 4 Model B (4GB)</td>
                        <td>Single Board Computer</td>
                        <td>Bench 1 &bull; Bin B2</td>
                        <td>
                          <span className="status-chip status-chip-warning">
                            <span className="status-chip-dot" />
                            <span>Low stock</span>
                          </span>
                        </td>
                        <td className="col-numeric" style={{ fontWeight: 600, color: "var(--warning)" }}>3</td>
                        <td className="col-numeric" style={{ color: "var(--text-muted)" }}>5</td>
                      </tr>
                      <tr>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>SEN-LIDAR-A1M8</td>
                        <td style={{ fontWeight: 600 }}>RPLIDAR A1 360° 12m Scanner</td>
                        <td>Sensor / Lidar</td>
                        <td>Bench 2 &bull; Cabinet 1</td>
                        <td>
                          <span className="status-chip status-chip-positive">
                            <span className="status-chip-dot" />
                            <span>Nominal</span>
                          </span>
                        </td>
                        <td className="col-numeric" style={{ fontWeight: 600 }}>6</td>
                        <td className="col-numeric" style={{ color: "var(--text-muted)" }}>2</td>
                      </tr>
                      <tr>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>MOT-MG996R-SRV</td>
                        <td style={{ fontWeight: 600 }}>MG996R High-Torque Metal Gear Servo</td>
                        <td>Actuators</td>
                        <td>Bench 3 &bull; Bin D1</td>
                        <td>
                          <span className="status-chip status-chip-positive">
                            <span className="status-chip-dot" />
                            <span>Nominal</span>
                          </span>
                        </td>
                        <td className="col-numeric" style={{ fontWeight: 600 }}>42</td>
                        <td className="col-numeric" style={{ color: "var(--text-muted)" }}>15</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Budget & Ledger View */}
          {activeTab === "budget" && (
            <div className="admin-tab-content">
              <div className="admin-view-header">
                <div>
                  <p className="admin-eyebrow">FISCAL TRANSPARENCY</p>
                  <h1 className="admin-page-title">Equipment budget & grants</h1>
                  <p className="admin-page-desc">Financial allocations, university grants, and component purchases.</p>
                </div>
                <div className="admin-header-actions">
                  <button type="button" className="btn-primary">Log transaction ↗</button>
                </div>
              </div>

              <div className="data-metrics-grid">
                <div className="data-metric-panel">
                  <span className="metric-label">Total allocated budget</span>
                  <div className="metric-readout-row">
                    <span className="metric-readout">$7,500</span>
                    <span className="metric-delta delta-positive">Annual grant</span>
                  </div>
                  <span className="metric-subtext">2024–2025 academic funding</span>
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
                    <span className="metric-delta delta-positive">Reserve ready</span>
                  </div>
                  <span className="metric-subtext">Contingency & rapid prototyping</span>
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
                        <td style={{ fontWeight: 600 }}>Jetson Orin Nano Developer Kit (2x)</td>
                        <td>Embedded Hardware</td>
                        <td>Supervisor approval</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>12 Feb 2025</td>
                        <td className="col-numeric" style={{ color: "var(--critical)", fontWeight: 600 }}>-$980.00</td>
                      </tr>
                      <tr>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>TX-2025-013</td>
                        <td style={{ fontWeight: 600 }}>University Innovation Grant Tranche 2</td>
                        <td>Grant Inflow</td>
                        <td>EST Safi Administration</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>01 Feb 2025</td>
                        <td className="col-numeric" style={{ color: "var(--positive)", fontWeight: 600 }}>+$2,500.00</td>
                      </tr>
                      <tr>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>TX-2025-012</td>
                        <td style={{ fontWeight: 600 }}>3D Printing Filament PLA+ (10kg spool)</td>
                        <td>Prototyping Consumables</td>
                        <td>President approval</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>20 Jan 2025</td>
                        <td className="col-numeric" style={{ color: "var(--critical)", fontWeight: 600 }}>-$220.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "settings" && <AdminSettings />}
        </AdminErrorBoundary>
      </main>
    </div>
  );
}
