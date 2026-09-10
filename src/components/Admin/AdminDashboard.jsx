import React, { Component, useCallback, useEffect, useRef, useState } from "react";
import AdminAnalytics from "./AdminAnalytics";
import AdminEvents from "./AdminEvents";
import AdminTeam from "./AdminTeam";
import AdminMembers from "./AdminMembers";
import AdminUsers from "./AdminUsers";
import SiteLoader from "../common/SiteLoader";
import { NAV_GALLERY_COLUMN_ONE, NAV_GALLERY_COLUMN_TWO } from "../FullNavMenu/navigationGallery";
import { loadAdminWorkspace } from "../../lib/adminWorkspace";
import { getAdminPermissions, hasAdminPermission } from "../../lib/adminPermissions";
import { publicContent, supabase } from "../../lib/supabaseClient";
import "../FullNavMenu/FullNavMenu.css";
import "./AdminDashboard.css";

class AdminErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="admin-tab-content">
        <div className="admin-panel admin-route-error">
          <span className="admin-eyebrow">VIEW ERROR</span>
          <h2>This workspace could not be rendered.</h2>
          <p>{this.state.error.message || "An unexpected dashboard error occurred."}</p>
          <button className="btn-primary" onClick={() => this.setState({ error: null })}>Retry view</button>
        </div>
      </div>
    );
  }
}

const NAV_ITEMS = [
  { id: "overview", permission: "overview", label: "Overview", caption: "Live analytics", icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> },
  { id: "team", permission: "team", label: "Team", caption: "Profiles & roles", icon: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2" /><path d="M17 4a4 4 0 0 1 0 8M19 15a5 5 0 0 1 2 4v2" /></> },
  { id: "events", permission: "events", label: "Events", caption: "Club experiences", icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></> },
  { id: "registrations", permission: "registrations", label: "Registrations", caption: "Review & intake", icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m17 11 2 2 4-4" /></> },
  { id: "users", permission: "users", label: "Admin users", caption: "Access & permissions", icon: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 11.5 19 10l3 1.5v3.2c0 2.2-1.3 4.2-3 5.3-1.7-1.1-3-3.1-3-5.3z" /></> },
];

function AdminLoadingScreen({ stage, error, onRetry, onClose, progress = 0, phase = "loading" }) {
  if (!error) return <SiteLoader phase={phase} progress={progress} stage={stage} />;

  return (
    <div className="admin-root-layout admin-loading-screen" role="status" aria-live="polite">
      <div className="admin-loading-ambient" />
      <div className="admin-loading-console">
        <div className="admin-loading-emblem">
          <span className="admin-loading-orbit" />
          <img src="/RAI/club-icon-light.png" alt="" />
        </div>
        <p className="admin-eyebrow">RAI OFFICER WORKSPACE</p>
        <h1>{error ? "Workspace unavailable" : "Preparing your dashboard"}</h1>
        <p className={error ? "admin-loading-error" : "admin-loading-stage"}>
          {error || stage}
        </p>
        {!error && <div className="admin-loading-progress"><i /></div>}
        {!error && <div className="admin-loading-modules"><span>Team</span><span>Events</span><span>Applicants</span><span>Analytics</span></div>}
        {error && (
          <div className="admin-loading-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Return to site</button>
            <button type="button" className="btn-primary" onClick={onRetry}>Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminLoginGalleryColumn({ images, direction }) {
  return (
    <div className={`infinite-col ${direction}`} aria-hidden="true">
      <div className="infinite-col-track">
        {[...images, ...images].map((item, index) => (
          <div className="full-nav-img-card" key={`${item.src}-${index}`}>
            <div className="full-nav-img-wrapper">
              <img src={item.src} alt="" loading="lazy" decoding="async" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminLoginScreen({
  email,
  passcode,
  authBusy,
  authLoading,
  authError,
  onEmailChange,
  onPasscodeChange,
  onSubmit,
  onClose,
}) {
  return (
    <div className="admin-root-layout admin-auth-screen-layout admin-menu-auth">
      <div className="full-nav-topography" aria-hidden="true">
        <svg viewBox="0 0 1440 900" fill="none" preserveAspectRatio="xMidYMid slice">
          <path d="M-100 200 C 200 150, 400 350, 700 250 C 1000 150, 1200 400, 1600 300" stroke="rgba(59, 130, 246, 0.14)" strokeWidth="1.5" />
          <path d="M-80 320 C 250 260, 450 480, 800 360 C 1100 240, 1300 520, 1650 420" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1.5" />
          <path d="M-50 450 C 300 380, 500 600, 850 480 C 1150 360, 1350 640, 1700 550" stroke="rgba(56, 189, 248, 0.12)" strokeWidth="1.5" />
          <path d="M-120 600 C 180 520, 420 750, 780 620 C 1080 500, 1280 780, 1620 700" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1.5" />
          <path d="M200 50 C 500 120, 750 -40, 1100 80 C 1350 170, 1500 50, 1750 140" stroke="rgba(37, 99, 235, 0.12)" strokeWidth="1.5" />
        </svg>
      </div>

      <button type="button" className="admin-menu-auth-close" onClick={onClose} aria-label="Return to the public website">
        <span />
        <span />
      </button>

      <div className="full-nav-body admin-menu-auth-body">
        <div className="full-nav-left-gallery admin-menu-auth-gallery">
          <div className="full-nav-infinite-columns">
            <AdminLoginGalleryColumn images={NAV_GALLERY_COLUMN_ONE} direction="col-up" />
            <AdminLoginGalleryColumn images={NAV_GALLERY_COLUMN_TWO} direction="col-down" />
          </div>
        </div>

        <section className="full-nav-right-content admin-menu-auth-content" aria-labelledby="admin-login-title">
          <div className="admin-menu-auth-panel">
            <div className="admin-menu-auth-brand">
              <span className="admin-menu-auth-logo-glow">
                <img className="admin-login-logo" src="/RAI/club-icon-light.png" alt="Robotics & AI Club logo" />
              </span>
              <div><strong>Robotics &amp; AI Club</strong><span>EST Safi officer workspace</span></div>
            </div>

            <p className="admin-menu-auth-kicker">Secure administration</p>
            <h1 id="admin-login-title" className="admin-auth-title">Officer sign in</h1>
            <p className="admin-auth-subtitle">Enter your authorized club account to manage the team, events and registrations.</p>

            <form onSubmit={onSubmit} className="admin-auth-standalone-form">
              <label className="admin-auth-input-wrapper" htmlFor="admin-email">
                <span className="admin-auth-label">Officer email</span>
                <input id="admin-email" type="email" required autoComplete="username" autoFocus className="admin-standalone-input" placeholder="officer@estsafi.ac.ma" value={email} onChange={onEmailChange} />
              </label>
              <label className="admin-auth-input-wrapper" htmlFor="admin-password">
                <span className="admin-auth-label">Password</span>
                <input id="admin-password" type="password" required autoComplete="current-password" className={`admin-standalone-input ${authError ? "has-error" : ""}`} placeholder="Enter your password" value={passcode} onChange={onPasscodeChange} />
              </label>

              {authError && <span className="admin-standalone-error" role="alert">{authError}</span>}

              <div className="admin-auth-btn-row">
                <button type="submit" className="admin-menu-auth-submit" disabled={authBusy || authLoading}>
                  {authLoading ? "Checking…" : authBusy ? "Signing in…" : "Sign in"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </div>
            </form>
          </div>

          <div className="full-nav-footer-row admin-menu-auth-footer">
            <div className="full-nav-enquiries">
              <span className="enquiries-title">Club &amp; lab enquiries</span>
              <a href="mailto:roboticsai.club.ests@gmail.com" className="enquiries-link">roboticsai.club.ests@gmail.com</a>
            </div>
            <button type="button" className="admin-menu-auth-return" onClick={onClose}>Return to site</button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AdminDashboard({ onClose }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [workspace, setWorkspace] = useState(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [loadStage, setLoadStage] = useState("Verifying your secure session");
  const [loadProgress, setLoadProgress] = useState(8);
  const [loadPhase, setLoadPhase] = useState("loading");
  const [loaderVisible, setLoaderVisible] = useState(true);
  const mainViewportRef = useRef(null);
  const preloadLockRef = useRef(false);

  const reportLoadStage = useCallback((stage) => {
    setLoadStage(stage);
    setLoadProgress((current) => Math.max(current, stage === "Connecting to the club database" ? 38 : 24));
  }, []);

  const syncRegistrations = useCallback((registrations, settings) => {
    setWorkspace((current) => current ? {
      ...current,
      registrations: Array.isArray(registrations) ? registrations : current.registrations,
      settings: settings || current.settings,
    } : current);
  }, []);

  const syncTeam = useCallback((team) => {
    setWorkspace((current) => current ? { ...current, team } : current);
  }, []);

  const syncEvents = useCallback((events) => {
    setWorkspace((current) => current ? { ...current, events } : current);
  }, []);

  useEffect(() => {
    let active = true;
    const applySession = (session) => {
      if (!active) return;
      const hasAdminAccess = session?.user?.app_metadata?.club_admin === true;
      setAdminUser(session?.user || null);
      setIsAuthenticated(hasAdminAccess);
      setAuthLoading(false);
      if (hasAdminAccess) {
        setLoadStage("Opening the officer workspace");
        setLoadProgress((current) => Math.max(current, 24));
      } else {
        setLoadStage("Ready");
        setLoadProgress(100);
        setLoadPhase("exiting");
      }
    };
    supabase.auth.getSession().then(({ data, error }) => {
      if (error && active) setAuthError("Could not restore your session. Please sign in.");
      applySession(data?.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (loadPhase !== "exiting") return undefined;
    const exitTimer = window.setTimeout(() => setLoaderVisible(false), 840);
    return () => window.clearTimeout(exitTimer);
  }, [loadPhase]);

  const preloadWorkspace = useCallback(async () => {
    if (preloadLockRef.current) return;
    preloadLockRef.current = true;
    setWorkspace(null);
    setWorkspaceError("");
    setLoaderVisible(true);
    setLoadPhase("loading");
    setLoadStage("Opening the officer workspace");
    setLoadProgress((current) => Math.max(24, Math.min(current, 38)));
    const startedAt = performance.now();
    try {
      const dataset = await loadAdminWorkspace(supabase, publicContent, reportLoadStage, getAdminPermissions(adminUser));
      setLoadStage("Finalizing the workspace");
      setLoadProgress(76);
      const minimumEntranceTime = Math.max(0, 850 - (performance.now() - startedAt));
      await new Promise((resolve) => window.setTimeout(resolve, minimumEntranceTime));
      setLoadStage("Workspace ready");
      setLoadProgress(100);
      setWorkspace(dataset);
      setLoadPhase("exiting");
    } catch (error) {
      setWorkspaceError(error.message || "The club data could not be loaded. Check the connection and try again.");
      setLoaderVisible(false);
    } finally {
      preloadLockRef.current = false;
    }
  }, [adminUser, reportLoadStage]);

  useEffect(() => {
    if (isAuthenticated && !workspace && !workspaceError) preloadWorkspace();
  }, [isAuthenticated, preloadWorkspace, workspace, workspaceError]);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: passcode });
      if (error) throw new Error("Unable to sign in. Check your email and password.");
      if (data.user?.app_metadata?.club_admin !== true) {
        await supabase.auth.signOut();
        throw new Error("This account does not have club officer access.");
      }
      setPasscode("");
      setAdminUser(data.user);
      setActiveTab("overview");
      setLoaderVisible(true);
      setLoadPhase("loading");
      setLoadProgress(20);
      setLoadStage("Opening the officer workspace");
      setIsAuthenticated(true);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return window.alert("Could not sign out. Please try again.");
    setWorkspace(null);
    setWorkspaceError("");
    setAdminUser(null);
    setActiveTab("overview");
    setIsAuthenticated(false);
    onClose();
  };

  if (loaderVisible && !workspaceError) {
    return <AdminLoadingScreen stage={loadStage} progress={loadProgress} phase={loadPhase} onClose={onClose} />;
  }

  if (authLoading) {
    return <AdminLoadingScreen stage="Verifying your secure session" progress={loadProgress} onClose={onClose} />;
  }

  if (!isAuthenticated) {
    return <AdminLoginScreen
      email={email}
      passcode={passcode}
      authBusy={authBusy}
      authLoading={authLoading}
      authError={authError}
      onEmailChange={(event) => setEmail(event.target.value)}
      onPasscodeChange={(event) => { setPasscode(event.target.value); setAuthError(""); }}
      onSubmit={handleLoginSubmit}
      onClose={onClose}
    />;
  }

  if (!workspace || workspaceError) {
    return <AdminLoadingScreen stage={loadStage} error={workspaceError} progress={loadProgress} onRetry={preloadWorkspace} onClose={onClose} />;
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => hasAdminPermission(adminUser, item.permission));
  const current = visibleNavItems.find((item) => item.id === activeTab) || visibleNavItems[0] || NAV_ITEMS[0];
  const navigate = (id) => {
    if (!visibleNavItems.some((item) => item.id === id)) return;
    setActiveTab(id);
    setMobileNavOpen(false);
    mainViewportRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <div className="admin-root-layout admin-command-shell admin-content-ready">
      <aside className={`admin-command-sidebar ${mobileNavOpen ? "is-open" : ""}`}>
        <button className="admin-command-brand" type="button" onClick={() => navigate("overview")}>
          <span className="admin-command-logo-glow"><img src="/RAI/club-icon-light.png" alt="Robotics & AI Club" /></span>
          <span><strong>RAI Club</strong><small>Officer console</small></span>
        </button>
        <nav className="admin-command-nav" aria-label="Admin sections">
          <span className="admin-command-nav-label">Manage club</span>
          {visibleNavItems.map((item) => (
            <button key={item.id} className={activeTab === item.id ? "is-active" : ""} type="button" onClick={() => navigate(item.id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{item.icon}</svg>
              <span className="admin-command-nav-copy"><strong>{item.label}</strong><small>{item.caption}</small></span>
            </button>
          ))}
        </nav>
        <div className="admin-command-sidebar-foot"><span className="admin-live-dot" /><span><strong>Database connected</strong><small>Authenticated session</small></span></div>
      </aside>
      {mobileNavOpen && <button className="admin-command-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <main ref={mainViewportRef} className="admin-main-viewport admin-command-main">
        <header className="admin-topbar admin-command-topbar">
          <div className="admin-topbar-left">
            <button type="button" className="admin-mobile-nav-trigger" onClick={() => setMobileNavOpen(true)} aria-label="Open admin navigation">☰</button>
            <span className="admin-command-breadcrumb">RAI control room <b>/</b> <strong>{current.label}</strong></span>
          </div>
          <div className="admin-topbar-right">
            <button type="button" className="topbar-view-site-btn" onClick={onClose}>Public site ↗</button>
            <button type="button" className="admin-signout-btn" onClick={handleLogout}>Sign out</button>
          </div>
        </header>
        {activeTab === "overview" && <section className="admin-section-panel">
          <AdminErrorBoundary><AdminAnalytics initialData={workspace} onNavigate={navigate} permissions={getAdminPermissions(adminUser)} /></AdminErrorBoundary>
        </section>}
        {activeTab === "team" && hasAdminPermission(adminUser, "team") && <section className="admin-section-panel">
          <AdminErrorBoundary><AdminTeam initialMembers={workspace.team} onDataChange={syncTeam} /></AdminErrorBoundary>
        </section>}
        {activeTab === "events" && hasAdminPermission(adminUser, "events") && <section className="admin-section-panel">
          <AdminErrorBoundary><AdminEvents initialEvents={workspace.events} onDataChange={syncEvents} /></AdminErrorBoundary>
        </section>}
        {activeTab === "registrations" && hasAdminPermission(adminUser, "registrations") && <section className="admin-section-panel">
          <AdminErrorBoundary><AdminMembers initialRegistrations={workspace.registrations} initialSettings={workspace.settings} onDataChange={syncRegistrations} /></AdminErrorBoundary>
        </section>}
        {activeTab === "users" && hasAdminPermission(adminUser, "users") && <section className="admin-section-panel">
          <AdminErrorBoundary><AdminUsers currentUser={adminUser} /></AdminErrorBoundary>
        </section>}
      </main>
    </div>
  );
}
