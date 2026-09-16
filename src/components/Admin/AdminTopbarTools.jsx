import { useEffect, useMemo, useRef, useState } from "react";
import { latestAdminNotifications, searchAdminSections } from "../../lib/adminHeader";
import "./AdminTopbarTools.css";

const formatActivityDate = (date) => new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(date));

export default function AdminTopbarTools({ items, workspace, onNavigate }) {
  const [query, setQuery] = useState("");
  const [openPanel, setOpenPanel] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const toolsRef = useRef(null);
  const searchRef = useRef(null);
  const bellRef = useRef(null);
  const results = searchAdminSections(items, query);
  const notifications = useMemo(() => latestAdminNotifications(workspace, items.map((item) => item.id)), [workspace, items]);
  const searchOpen = openPanel === "search";

  useEffect(() => {
    if (!openPanel) return undefined;
    const closeOutside = (event) => {
      if (!toolsRef.current?.contains(event.target)) setOpenPanel(null);
    };
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpenPanel(null);
      if (openPanel === "notifications") bellRef.current?.focus();
    };
    const closeOnBlur = (event) => {
      if (!toolsRef.current?.contains(event.target)) setOpenPanel(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("focusin", closeOnBlur);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("focusin", closeOnBlur);
    };
  }, [openPanel]);

  const openSection = (section) => {
    setOpenPanel(null);
    setQuery("");
    setSelectedIndex(0);
    onNavigate(section);
    searchRef.current?.blur();
  };

  const handleSearchKey = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpenPanel("search");
      setSelectedIndex((index) => {
        if (!results.length) return 0;
        if (!searchOpen) return event.key === "ArrowDown" ? 0 : results.length - 1;
        return (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results[selectedIndex]) openSection(results[selectedIndex].id);
    }
  };

  return (
    <div ref={toolsRef} className="admin-header-tools">
      <div className="admin-section-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
        <input ref={searchRef} type="search" role="combobox" aria-label="Search dashboard sections" aria-autocomplete="list" aria-expanded={searchOpen} aria-controls="admin-section-search-results" aria-activedescendant={searchOpen && results[selectedIndex] ? `admin-search-${results[selectedIndex].id}` : undefined} placeholder="Search sections…" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); setOpenPanel("search"); }} onFocus={() => { setOpenPanel("search"); setSelectedIndex(0); }} onKeyDown={handleSearchKey} autoComplete="off" />
        {searchOpen && <div className="admin-header-dropdown admin-search-dropdown">
          <div className="admin-header-dropdown-heading">Go to section <span>↑ ↓ · Enter</span></div>
          <div id="admin-section-search-results" role="listbox" aria-label="Dashboard sections">
            {results.map((item, index) => <div key={item.id} id={`admin-search-${item.id}`} role="option" aria-selected={index === selectedIndex} className={`admin-search-result ${index === selectedIndex ? "is-selected" : ""}`} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setSelectedIndex(index)} onClick={() => openSection(item.id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{item.icon}</svg>
              <span><strong>{item.label}</strong><small>{item.caption}</small></span><span className="admin-search-arrow" aria-hidden="true">↗</span>
            </div>)}
          </div>
          {!results.length && <p className="admin-header-empty" role="status">No matching sections. Try another name.</p>}
        </div>}
      </div>
      <div className="admin-notification-control">
        <button ref={bellRef} type="button" className={`admin-notification-bell ${openPanel === "notifications" ? "is-open" : ""}`} aria-label={`Latest notifications, ${notifications.length} recent updates`} aria-expanded={openPanel === "notifications"} aria-controls="admin-latest-notifications" title="Latest notifications" onClick={() => setOpenPanel((panel) => panel === "notifications" ? null : "notifications")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
          {notifications.length > 0 && <span className="admin-notification-count" aria-hidden="true">{notifications.length}</span>}
        </button>
        {openPanel === "notifications" && <section id="admin-latest-notifications" className="admin-header-dropdown admin-notification-dropdown" aria-label="Latest notifications">
          <div className="admin-header-dropdown-heading">Latest notifications <span>Recent club activity</span></div>
          {notifications.length ? <ul className="admin-notification-list">
            {notifications.map((item) => <li key={item.id}><button type="button" onClick={() => { openSection(item.section); bellRef.current?.focus(); }}>
              <span className="admin-activity-marker" aria-hidden="true">{item.section === "events" ? "↗" : "+"}</span>
              <span className="admin-activity-copy"><strong>{item.title}</strong><span>{item.detail}</span><time dateTime={item.date}>{formatActivityDate(item.date)}</time></span>
              <span className="admin-activity-arrow" aria-hidden="true">→</span>
            </button></li>)}
          </ul> : <p className="admin-header-empty">No recent activity in the sections you can access.</p>}
        </section>}
      </div>
    </div>
  );
}
