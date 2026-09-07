import React, { Component, useCallback, useEffect, useRef, useState } from "react";
import AdminAnalytics from "./AdminAnalytics";
import AdminEvents from "./AdminEvents";
import AdminTeam from "./AdminTeam";
import AdminMembers from "./AdminMembers";
import { loadAdminWorkspace, warmAdminImageCache } from "../../lib/adminWorkspace";
import { publicContent, supabase } from "../../lib/supabaseClient";
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
  { id: "overview", label: "Overview", caption: "Live analytics", icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> },
  { id: "team", label: "Team", caption: "Profiles & roles", icon: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2" /><path d="M17 4a4 4 0 0 1 0 8M19 15a5 5 0 0 1 2 4v2" /></> },
  { id: "events", label: "Events", caption: "Club experiences", icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></> },
  { id: "registrations", label: "Registrations", caption: "Review & intake", icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m17 11 2 2 4-4" /></> },
];

function AdminLoadingScreen({ stage, error, onRetry, onClose }) {
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
        {!error && <div className="admin-loading-modules"><span>TEAM</span><span>EVENTS</span><span>APPLICANTS</span><span>ANALYTICS</span></div>}
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

export default function AdminDashboard({ onClose }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
  const mainViewportRef = useRef(null);
  const preloadLockRef = useRef(false);

  const syncRegistrations = useCallback((registrations, settings) => {
    setWorkspace((current) => current ? {
      ...current,
      registrations: Array.isArray(registrations) ? registrations : current.registrations,
      settings: settings || current.settings,
    } : current);
  }, []);

  useEffect(() => {
    let active = true;
    const applySession = (session) => {
      if (!active) return;
      setIsAuthenticated(session?.user?.app_metadata?.club_admin === true);
      setAuthLoading(false);
    };
    supabase.auth.getSession().then(({ data, error }) => {
      if (error && active) setAuthError("Could not restore your session. Please sign in.");
      applySession(data?.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const preloadWorkspace = useCallback(async () => {
    if (preloadLockRef.current) return;
    preloadLockRef.current = true;
    setWorkspace(null);
    setWorkspaceError("");
    const startedAt = performance.now();
    try {
      const dataset = await loadAdminWorkspace(supabase, publicContent, setLoadStage);
      setLoadStage("Caching club media");
      const minimumEntranceTime = Math.max(0, 850 - (performance.now() - startedAt));
      await Promise.all([
        warmAdminImageCache(dataset),
        new Promise((resolve) => window.setTimeout(resolve, minimumEntranceTime)),
      ]);
      setLoadStage("Workspace ready");
      setWorkspace(dataset);
    } catch (error) {
      setWorkspaceError(error.message || "The club data could not be loaded. Check the connection and try again.");
    } finally {
      preloadLockRef.current = false;
    }
  }, []);

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
    setIsAuthenticated(false);
    onClose();
  };

  if (authLoading) {
    return <AdminLoadingScreen stage="Verifying your secure session" onClose={onClose} />;
  }

  if (!isAuthenticated) {
    return (
      <div className="admin-root-layout admin-auth-screen-layout">
        <div className="admin-auth-card-standalone admin-auth-card-branded">
          <div className="admin-auth-mark">
            <img className="admin-login-logo" src="/RAI/club-icon-light.png" alt="Robotics & AI Club logo" />
            <div><strong>Robotics &amp; AI Club</strong><span>EST Safi · Officer workspace</span></div>
          </div>
          <p className="admin-eyebrow">SECURE ADMINISTRATION</p>
          <h1 className="admin-auth-title">Officer sign in</h1>
          <p className="admin-auth-subtitle">Use your authorized club account to manage the public team, events, and member intake.</p>
          <form onSubmit={handleLoginSubmit} className="admin-auth-standalone-form">
            <label className="admin-auth-input-wrapper" htmlFor="admin-email">
              <span className="admin-auth-label">Officer email</span>
              <input id="admin-email" type="email" required autoComplete="username" className="admin-standalone-input" placeholder="officer@estsafi.ac.ma" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="admin-auth-input-wrapper" htmlFor="admin-password">
              <span className="admin-auth-label">Password</span>
              <input id="admin-password" type="password" required autoComplete="current-password" className={`admin-standalone-input ${authError ? "has-error" : ""}`} placeholder="••••••••••••" value={passcode} onChange={(e) => { setPasscode(e.target.value); setAuthError(""); }} />
              {authError && <span className="admin-standalone-error" role="alert">{authError}</span>}
            </label>
            <div className="admin-auth-btn-row">
              <button type="button" className="btn-secondary" onClick={onClose}>Return to site</button>
              <button type="submit" className="btn-primary" disabled={authBusy || authLoading}>{authLoading ? "Checking…" : authBusy ? "Signing in…" : "Sign in ↗"}</button>
            </div>
          </form>
          <div className="admin-auth-footer-hint"><span>Protected club workspace</span><span>RAI / ESTS</span></div>
        </div>
      </div>
    );
  }

  if (!workspace || workspaceError) {
    return <AdminLoadingScreen stage={loadStage} error={workspaceError} onRetry={preloadWorkspace} onClose={onClose} />;
  }

  const current = NAV_ITEMS.find((item) => item.id === activeTab) || NAV_ITEMS[0];
  const navigate = (id) => {
    setActiveTab(id);
    setMobileNavOpen(false);
    mainViewportRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <div className="admin-root-layout admin-command-shell">
      <aside className={`admin-command-sidebar ${mobileNavOpen ? "is-open" : ""}`}>
        <button className="admin-command-brand" type="button" onClick={() => navigate("overview")}>
          <span className="admin-command-logo-glow"><img src="/RAI/club-icon-light.png" alt="Robotics & AI Club" /></span>
          <span><strong>RAI Club</strong><small>Officer console</small></span>
        </button>
        <nav className="admin-command-nav" aria-label="Admin sections">
          <span className="admin-command-nav-label">WORKSPACE</span>
          {NAV_ITEMS.map((item, index) => (
            <button key={item.id} className={activeTab === item.id ? "is-active" : ""} type="button" onClick={() => navigate(item.id)}>
              <span className="admin-command-nav-index">0{index + 1}</span>
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
            <span className="admin-command-breadcrumb">RAI / ADMIN / <strong>{current.label.toUpperCase()}</strong></span>
          </div>
          <div className="admin-topbar-right">
            <button type="button" className="topbar-view-site-btn" onClick={onClose}>Public site ↗</button>
            <button type="button" className="admin-signout-btn" onClick={handleLogout}>Sign out</button>
          </div>
        </header>
        <section className="admin-section-panel" hidden={activeTab !== "overview"}>
          <AdminErrorBoundary><AdminAnalytics initialData={workspace} onNavigate={navigate} /></AdminErrorBoundary>
        </section>
        <section className="admin-section-panel" hidden={activeTab !== "team"}>
          <AdminErrorBoundary><AdminTeam initialMembers={workspace.team} /></AdminErrorBoundary>
        </section>
        <section className="admin-section-panel" hidden={activeTab !== "events"}>
          <AdminErrorBoundary><AdminEvents initialEvents={workspace.events} /></AdminErrorBoundary>
        </section>
        <section className="admin-section-panel" hidden={activeTab !== "registrations"}>
          <AdminErrorBoundary><AdminMembers initialRegistrations={workspace.registrations} initialSettings={workspace.settings} onDataChange={syncRegistrations} /></AdminErrorBoundary>
        </section>
      </main>
    </div>
  );
}
