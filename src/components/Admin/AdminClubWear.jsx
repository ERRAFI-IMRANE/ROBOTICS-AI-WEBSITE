import React, { useCallback, useEffect, useMemo, useState } from "react";
import { loadClubWearWorkspace, setClubWearItem } from "../../lib/clubWear";
import { supabase } from "../../lib/supabaseClient";
import { AdminConfirmDialog, AdminToast } from "./AdminActionFeedback";
import { useAdminToast } from "./useAdminToast";
import "./AdminClubWear.css";

const ITEM_LABELS = Object.freeze({ tshirt: "T-shirt", hoodie: "Hoodie" });
const CURRENT_CLUB_WEAR_SEASON = "2026-2027";

function ShirtIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m8 4-5 3 2.3 4L8 9.6V20h8V9.6l2.7 1.4L21 7l-5-3a5 5 0 0 1-8 0Z" /></svg>;
}

function HoodieIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8.2 5.2A4.8 4.8 0 0 1 12 3a4.8 4.8 0 0 1 3.8 2.2L19 7l2 5-3 1.2V21H6v-7.8L3 12l2-5 3.2-1.8Z" /><path d="M8.2 5.2c.3 2.2 1.6 3.3 3.8 3.3s3.5-1.1 3.8-3.3M12 8.5V21" /></svg>;
}

function initials(name) {
  return String(name || "Member").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function movementDate(item) {
  const value = item.status === "issued" ? item.issued_at : item.returned_at || item.updated_at;
  if (!value) return "No movement yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Movement recorded";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function statusCopy(item) {
  if (item.status === "issued") return "With member";
  if (item.status === "returned") return "Returned";
  return "Not issued";
}

function WearItem({ type, item, member, busy, onRequest }) {
  const issued = item.status === "issued";
  return (
    <div className={`admin-wear-item is-${item.status}`}>
      <span className="admin-wear-item-icon">{type === "tshirt" ? <ShirtIcon /> : <HoodieIcon />}</span>
      <div className="admin-wear-item-copy">
        <span>{ITEM_LABELS[type]}</span>
        <strong>{statusCopy(item)}</strong>
        <small>{movementDate(item)}</small>
      </div>
      <span className={`admin-wear-state is-${item.status}`}><i />{issued ? "OUT" : item.status === "returned" ? "IN" : "READY"}</span>
      <label className={`admin-wear-check ${issued ? "is-checked" : ""} ${busy ? "is-busy" : ""}`}>
        <input
          type="checkbox"
          checked={issued}
          disabled={busy}
          onChange={() => onRequest(member, type, !issued)}
          aria-label={`${ITEM_LABELS[type]} taken by ${member.full_name}`}
        />
        <span aria-hidden="true">{issued ? "✓" : ""}</span>
        <b>{busy ? "Saving…" : issued ? "Taken" : "Not taken"}</b>
      </label>
    </div>
  );
}

function WearSkeleton() {
  return <div className="admin-wear-list" aria-label="Loading team clothing"><div className="admin-wear-skeleton" /><div className="admin-wear-skeleton" /><div className="admin-wear-skeleton" /></div>;
}

export default function AdminClubWear() {
  const [workspace, setWorkspace] = useState({ season: "", seasons: [], members: [] });
  const selectedSeason = CURRENT_CLUB_WEAR_SEASON;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const { toast, showToast, clearToast } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadClubWearWorkspace(supabase, CURRENT_CLUB_WEAR_SEASON);
      setWorkspace(next);
    } catch (loadError) {
      setError(loadError.message || "Club wear data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const metrics = useMemo(() => {
    const tshirts = workspace.members.filter((member) => member.tshirt.status === "issued").length;
    const hoodies = workspace.members.filter((member) => member.hoodie.status === "issued").length;
    const carrying = workspace.members.filter((member) => member.tshirt.status === "issued" || member.hoodie.status === "issued").length;
    return { total: workspace.members.length, tshirts, hoodies, carrying };
  }, [workspace.members]);

  const visibleMembers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return workspace.members.filter((member) => {
      const issuedCount = Number(member.tshirt.status === "issued") + Number(member.hoodie.status === "issued");
      if (filter === "issued" && issuedCount === 0) return false;
      if (filter === "clear" && issuedCount > 0) return false;
      if (!needle) return true;
      return [member.full_name, member.role, member.post_abbr, member.department]
        .some((value) => String(value || "").toLocaleLowerCase().includes(needle));
    });
  }, [filter, search, workspace.members]);

  function requestMovement(member, itemType, issued) {
    const itemLabel = ITEM_LABELS[itemType];
    setConfirmation({
      member,
      itemType,
      issued,
      title: issued ? `Issue ${itemLabel}` : `Confirm ${itemLabel} return`,
      message: issued
        ? `${itemLabel} will be recorded as issued to ${member.full_name} for ${selectedSeason}.`
        : `${member.full_name}'s ${itemLabel.toLowerCase()} will be recorded as returned and available again.`,
      confirmLabel: issued ? `Issue ${itemLabel}` : "Mark returned",
      tone: "primary",
    });
  }

  async function confirmMovement() {
    if (!confirmation || busyKey) return;
    const action = confirmation;
    const key = `${action.member.id}-${action.itemType}`;
    setBusyKey(key);
    try {
      await setClubWearItem(supabase, {
        teamId: action.member.id,
        season: selectedSeason,
        itemType: action.itemType,
        issued: action.issued,
      });
      setConfirmation(null);
      await load();
      showToast(`${ITEM_LABELS[action.itemType]} ${action.issued ? "issued to" : "returned by"} ${action.member.full_name}.`);
    } catch (movementError) {
      showToast(movementError.message || "The clothing status could not be changed.", "error");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="admin-tab-content admin-wear-view">
      <div className="admin-view-header">
        <div>
          <h1 className="admin-page-title">Hoodies &amp; T-shirts</h1>
          <p className="admin-page-desc">Check the T-shirt or hoodie taken by each 2026-2027 Team member, then uncheck it when the item is returned. Supervisors, co-supervisors, and advisors are excluded.</p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-wear-current-season"><small>Current Team</small><strong>{CURRENT_CLUB_WEAR_SEASON}</strong></span>
          <button type="button" className="btn-secondary" onClick={load} disabled={loading || !!busyKey}>{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert"><strong>Club wear unavailable.</strong><span>{error}</span><button type="button" className="btn-secondary" onClick={load}>Try again</button></div>}

      <section className="admin-wear-overview" aria-label="Club wear overview">
        <article><span>Eligible Team</span><strong>{loading ? "—" : metrics.total}</strong><small>{CURRENT_CLUB_WEAR_SEASON}</small></article>
        <article><span>T-shirts out</span><strong>{loading ? "—" : metrics.tshirts}</strong><small>{metrics.tshirts === 1 ? "One active loan" : "Active loans"}</small></article>
        <article><span>Hoodies out</span><strong>{loading ? "—" : metrics.hoodies}</strong><small>{metrics.hoodies === 1 ? "One active loan" : "Active loans"}</small></article>
        <article><span>Members carrying</span><strong>{loading ? "—" : metrics.carrying}</strong><small>At least one item</small></article>
      </section>

      <section className="admin-panel admin-wear-roster-panel">
        <header className="admin-wear-roster-header">
          <div><h2>Team clothing register</h2><p>{loading ? "Loading Team…" : `${visibleMembers.length} of ${workspace.members.length} members`}</p></div>
          <div className="admin-wear-tools">
            <label><span className="sr-only">Search Team</span><input type="search" placeholder="Search by name or role" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <div className="admin-wear-filters" aria-label="Clothing status filter">
              {[{ id: "all", label: "All" }, { id: "issued", label: "Has items" }, { id: "clear", label: "No items out" }].map((option) => <button key={option.id} type="button" className={filter === option.id ? "is-active" : ""} onClick={() => setFilter(option.id)}>{option.label}</button>)}
            </div>
          </div>
        </header>

        {loading ? <WearSkeleton /> : visibleMembers.length === 0 ? (
          <div className="admin-wear-empty"><strong>No matching Team members</strong><span>Change the season, search, or status filter to view another part of the clothing register.</span></div>
        ) : (
          <div className="admin-wear-list">
            {visibleMembers.map((member) => <article className="admin-wear-member" key={member.id}>
              <div className="admin-wear-person">
                <span className="admin-wear-avatar">
                  {member.avatar_img ? <img src={member.avatar_img} alt="" loading="lazy" decoding="async" /> : initials(member.full_name)}
                </span>
                <div><strong>{member.full_name}</strong><span>{member.role || member.post_abbr || "Team member"}</span><small>{member.department || selectedSeason}</small></div>
              </div>
              <WearItem type="tshirt" item={member.tshirt} member={member} busy={busyKey === `${member.id}-tshirt`} onRequest={requestMovement} />
              <WearItem type="hoodie" item={member.hoodie} member={member} busy={busyKey === `${member.id}-hoodie`} onRequest={requestMovement} />
            </article>)}
          </div>
        )}
      </section>

      <AdminConfirmDialog confirmation={confirmation} busy={!!busyKey} onCancel={() => { if (!busyKey) setConfirmation(null); }} onConfirm={confirmMovement} />
      <AdminToast toast={toast} onClose={clearToast} />
    </div>
  );
}
