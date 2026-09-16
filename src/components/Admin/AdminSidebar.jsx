import { useEffect, useRef, useState } from "react";

export default function AdminSidebar({ items, activeTab, collapsed, mobileOpen, onToggle, onCloseMobile, onNavigate }) {
  const sidebarRef = useRef(null);
  const closeRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => { setTooltip(null); }, [collapsed, activeTab, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseMobile();
      }
      if (event.key !== "Tab") return;
      const controls = [...sidebarRef.current.querySelectorAll("button")]
        .filter((button) => !button.disabled && button.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mobileOpen, onCloseMobile]);

  const showTooltip = (event, item) => {
    if (!collapsed || window.matchMedia("(max-width: 920px)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const sidebarBounds = sidebarRef.current.getBoundingClientRect();
    setTooltip({ ...item, left: sidebarBounds.right + 12, top: Math.max(12, Math.min(bounds.top, window.innerHeight - 76)) });
  };

  return (
    <aside ref={sidebarRef} className={`admin-command-sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="Officer navigation" role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined}>
      <button className="admin-sidebar-collapse-toggle" type="button" onClick={onToggle} aria-expanded={!collapsed} aria-controls="admin-sidebar-navigation" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={collapsed ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} /></svg>
      </button>
      <button ref={closeRef} className="admin-sidebar-mobile-close" type="button" onClick={onCloseMobile} aria-label="Close navigation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      <button className="admin-command-brand" type="button" onClick={() => onNavigate("overview")} aria-label="RAI Club overview">
        <span className="admin-command-logo-glow"><img src="/RAI/club-icon-light.png" alt="Robotics & AI Club" /></span>
        <span className="admin-command-brand-copy"><strong>RAI Club</strong><small>Officer console</small></span>
      </button>
      <nav id="admin-sidebar-navigation" className="admin-command-nav" aria-label="Admin sections" onScroll={() => setTooltip(null)}>
        <span className="admin-command-nav-label">Manage club</span>
        {items.map((item) => (
          <button key={item.id} className={activeTab === item.id ? "is-active" : ""} type="button" onClick={() => onNavigate(item.id)} aria-label={item.label} aria-current={activeTab === item.id ? "page" : undefined} aria-describedby={tooltip?.id === item.id ? "admin-sidebar-tooltip" : undefined} onMouseEnter={(event) => showTooltip(event, item)} onMouseLeave={() => setTooltip(null)} onFocus={(event) => showTooltip(event, item)} onBlur={() => setTooltip(null)} onKeyDown={(event) => { if (event.key === "Escape") setTooltip(null); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{item.icon}</svg>
            <span className="admin-command-nav-copy"><strong>{item.label}</strong><small>{item.caption}</small></span>
          </button>
        ))}
      </nav>
      <div className="admin-command-sidebar-foot" aria-label="Database connected. Authenticated session." title={collapsed ? "Database connected · Authenticated session" : undefined}><span className="admin-live-dot" /><span className="admin-command-status-copy"><strong>Database connected</strong><small>Authenticated session</small></span></div>
      {tooltip && <div id="admin-sidebar-tooltip" className="admin-sidebar-tooltip" role="tooltip" style={{ left: tooltip.left, top: tooltip.top }}><strong>{tooltip.label}</strong><span>{tooltip.caption}</span></div>}
    </aside>
  );
}
