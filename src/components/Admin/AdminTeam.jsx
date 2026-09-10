import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase, publicContent } from "../../lib/supabaseClient";
import { withRequestTimeout } from "../../lib/requestTimeout";
import { saveStaff, deleteStaff } from "../../lib/adminStaff";
import { deleteMediaUrls, uploadMedia } from "../../lib/mediaStorage";
import {
  DEFAULT_TEAM_SEASON,
  TEAM_POSTS,
  TEAM_SEASONS,
  createTeamAssignment,
  getEquivalentTeamSeasonKeys,
  getTeamPost,
  normalizeTeamRole,
  normalizeTeamSeason,
} from "../../constants/teamPosts";
import "./AdminDashboard.css";

const FILIERES = [
  "Génie Informatique",
  "Génie Électrique (GIME)",
  "Génie Industriel & Maintenance",
  "Techniques de Management",
];

// Helper to extract years array from member record
const getMemberYears = (m) => {
  let years = [];
  if (Array.isArray(m?.team_seasons) && m.team_seasons.length > 0) {
    years = m.team_seasons.map((ts) => ts.season);
  } else if (m?.season_roles && typeof m.season_roles === "object" && Object.keys(m.season_roles).length > 0) {
    years = Object.keys(m.season_roles);
  } else {
    const rawYears = m?.years || m?.data?.years;
    if (Array.isArray(rawYears)) years = rawYears;
    else if (typeof rawYears === "string") years = rawYears.split(",");
  }
  const normalized = years.map(normalizeTeamSeason).filter(Boolean);
  return normalized.length ? [...new Set(normalized)] : [DEFAULT_TEAM_SEASON];
};

// Helper to get season roles mapping { [year]: role }
const getMemberSeasonRoles = (m) => {
  if (Array.isArray(m?.team_seasons) && m.team_seasons.length > 0) {
    const map = {};
    m.team_seasons.forEach((ts) => {
      const season = normalizeTeamSeason(ts.season);
      if (season) map[season] = normalizeTeamRole(ts.role) || ts.role || "Active Member";
    });
    return map;
  }
  if (m?.season_roles && typeof m.season_roles === "object" && Object.keys(m.season_roles).length > 0) {
    return Object.fromEntries(Object.entries(m.season_roles)
      .map(([season, role]) => [normalizeTeamSeason(season), normalizeTeamRole(role) || role])
      .filter(([season]) => season));
  }
  const years = getMemberYears(m);
  const rawRole = m?.post || m?.role || m?.data?.role;
  const fallbackRole = normalizeTeamRole(rawRole) || rawRole || "Active Member";
  const map = {};
  years.forEach((yr) => {
    map[yr] = fallbackRole;
  });
  return map;
};

// Helper to get role for a specific year
const getMemberRoleForYear = (m, year) => {
  const seasonRoles = getMemberSeasonRoles(m);
  const season = normalizeTeamSeason(year);
  if (seasonRoles[season]) return seasonRoles[season];
  const rawRole = m?.post || m?.role || m?.data?.role;
  return normalizeTeamRole(rawRole) || rawRole || "Active Member";
};

// Priority rank helper for hierarchy
const getRolePriority = (roleStr = "") => {
  return getTeamPost(roleStr)?.post_order ?? 999;
};

const getMemberName = (m) => m?.full_name || m?.name || m?.data?.name || "Member";
const getMemberFiliere = (m) => m?.department || m?.filiere || m?.data?.filiere || "";
const getMemberAvatar = (m) => m?.avatar_img || m?.image || m?.image_url || m?.data?.image || "/imrane-anime.png";
const getMemberAvatarSource = (m) => m?.avatar_img || m?.image || m?.image_url || m?.data?.image || "";
const getMemberNormal = (m) => m?.normal_img || m?.normal_image || m?.normalImage || m?.hover_image || m?.hoverImage || m?.data?.normalImage || "";
const getMemberSocials = (m) => m?.social_media_links || m?.links || m?.socials || m?.data?.socials || {};
const getMemberSex = (m) => ["M", "F"].includes(m?.sex) ? m.sex : "M";

// Helper to extract post order attribute for a specific season from team_seasons
const getMemberPostOrder = (m, season) => {
  if (!m) return Infinity;
  if (Array.isArray(m?.team_seasons) && m.team_seasons.length > 0) {
    const keys = getEquivalentTeamSeasonKeys(season);
    const found = m.team_seasons.find((ts) => keys.includes(String(ts.season)));
    if (found && found.post_order !== null && found.post_order !== undefined && !isNaN(Number(found.post_order))) {
      return Number(found.post_order);
    }
  }

  // legacy fallback
  const data = m.data || {};
  const orderSources = [
    m.order_post,
    m.post_order,
    data.order_post,
    data.post_order,
    m.order,
    data.order,
  ];

  for (const src of orderSources) {
    if (src !== undefined && src !== null && src !== "") {
      if (typeof src === "object" && !Array.isArray(src)) {
        if (src[season] !== undefined && src[season] !== null && src[season] !== "") {
          const parsed = Number(src[season]);
          if (!isNaN(parsed)) return parsed;
        }
      } else {
        const parsed = Number(src);
        if (!isNaN(parsed)) return parsed;
      }
    }
  }

  return Infinity;
};

const getMemberSeasonAssignments = (member) => {
  const rows = Array.isArray(member?.team_seasons) && member.team_seasons.length
    ? member.team_seasons
    : Object.entries(getMemberSeasonRoles(member)).map(([season, role]) => ({ season, role }));
  return rows
    .map((row) => ({
      ...row,
      season: normalizeTeamSeason(row.season),
      role: normalizeTeamRole(row.role) || row.role || "Active Member",
    }))
    .filter((row) => row.season)
    .sort((a, b) => {
      const orderA = Number.isFinite(Number(a.post_order)) ? Number(a.post_order) : getRolePriority(a.role);
      const orderB = Number.isFinite(Number(b.post_order)) ? Number(b.post_order) : getRolePriority(b.role);
      return orderA - orderB || a.season.localeCompare(b.season);
    });
};

export default function AdminTeam({ initialMembers = null, onDataChange = () => {} }) {
  const hasInitialMembers = Array.isArray(initialMembers);
  const seededMembers = hasInitialMembers ? initialMembers : [];
  const [members, setMembers] = useState(seededMembers);
  const yearsList = TEAM_SEASONS;
  const [selectedYear, setSelectedYear] = useState(DEFAULT_TEAM_SEASON);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(!hasInitialMembers);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  // Profile Details Inspection Modal
  const [selectedProfileMember, setSelectedProfileMember] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Member Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [formName, setFormName] = useState("");
  const [formFiliere, setFormFiliere] = useState(FILIERES[0]);
  const [formBirthday, setFormBirthday] = useState("");
  const [formSex, setFormSex] = useState("M");
  const [formSeasonRoles, setFormSeasonRoles] = useState({ [DEFAULT_TEAM_SEASON]: "" });

  // Image Uploads State & Refs
  const avatarInputRef = useRef(null);
  const normalImageInputRef = useRef(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [normalImageFile, setNormalImageFile] = useState(null);
  const [normalImagePreview, setNormalImagePreview] = useState("");

  const handleAvatarFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreview(previewUrl);
    }
  };

  const handleNormalFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setNormalImageFile(file);
      const previewUrl = URL.createObjectURL(file);
      setNormalImagePreview(previewUrl);
    }
  };

  const handleClearAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview("");
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const handleClearNormal = () => {
    setNormalImageFile(null);
    setNormalImagePreview("");
    if (normalImageInputRef.current) normalImageInputRef.current.value = "";
  };

  // Social Links
  const [formInstagram, setFormInstagram] = useState("");
  const [formLinkedin, setFormLinkedin] = useState("");
  const [formGithub, setFormGithub] = useState("");

  const [toastMsg, setToastMsg] = useState(null);

  const loadTeamData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");

      // Query team and embed all related team_seasons records (Staff ONLY)
      let { data, error } = await withRequestTimeout(publicContent
        .from("team")
        .select(`
          id,
          full_name,
          avatar_img,
          normal_img,
          birthday,
          department,
          social_media_links,
          sex,
          team_seasons (
            id,
            team_id,
            season,
            role,
            post_abbr,
            post_order
          )
        `)
        .order("id", { ascending: false }), "Loading staff");

      if (error || !data) {
        // Fallback: simple team query
        const retryRes = await withRequestTimeout(publicContent.from("team").select("*"), "Loading staff");
        if (!retryRes.error && retryRes.data) {
          data = retryRes.data;
          error = null;
        } else {
          error = retryRes.error || error;
        }
      }

      if (error) throw error;

      const rows = data && Array.isArray(data) ? data : [];
      setMembers(rows);
      onDataChange(rows);

      setSelectedYear((current) => TEAM_SEASONS.includes(current) ? current : DEFAULT_TEAM_SEASON);
    } catch (err) {
      console.warn("Could not fetch team from database:", err);
      setLoadError("Could not load staff from Supabase: " + (err.message || "Check your connection and access permissions."));
    } finally {
      setLoading(false);
    }
  }, [onDataChange]);

  useEffect(() => {
    if (!hasInitialMembers) loadTeamData();
  }, [hasInitialMembers, loadTeamData]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleOpenAdd = () => {
    setEditingMember(null);
    setFormName("");
    setFormFiliere(FILIERES[0]);
    setFormBirthday("");
    setFormSex("M");
    const initialYear = TEAM_SEASONS.includes(selectedYear) ? selectedYear : DEFAULT_TEAM_SEASON;
    setFormSeasonRoles({ [initialYear]: "" });

    setAvatarFile(null);
    setAvatarPreview("");
    setNormalImageFile(null);
    setNormalImagePreview("");
    if (avatarInputRef.current) avatarInputRef.current.value = "";
    if (normalImageInputRef.current) normalImageInputRef.current.value = "";

    setFormInstagram("");
    setFormLinkedin("");
    setFormGithub("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (m) => {
    setEditingMember(m);
    setFormName(getMemberName(m));
    setFormFiliere(getMemberFiliere(m) || FILIERES[0]);
    setFormBirthday(m.birthday || "");
    setFormSex(getMemberSex(m));

    const sRoles = getMemberSeasonRoles(m);
    const activeRoles = Object.fromEntries(Object.entries(sRoles)
      .filter(([season]) => TEAM_SEASONS.includes(season))
      .map(([season, role]) => [season, normalizeTeamRole(role)]));
    if (Object.keys(activeRoles).length === 0) {
      activeRoles[TEAM_SEASONS.includes(selectedYear) ? selectedYear : DEFAULT_TEAM_SEASON] = "";
    }
    setFormSeasonRoles(activeRoles);

    setAvatarFile(null);
    setAvatarPreview(getMemberAvatarSource(m));
    setNormalImageFile(null);
    setNormalImagePreview(getMemberNormal(m));

    const socials = getMemberSocials(m);
    setFormInstagram(socials.instagram || m.instagram || "");
    setFormLinkedin(socials.linkedin || m.linkedin || "");
    setFormGithub(socials.github || m.github || "");
    setIsModalOpen(true);
  };

  const handleOpenProfile = (m) => {
    setSelectedProfileMember(m);
    setIsProfileModalOpen(true);
  };

  const handleToggleSeason = (yr) => {
    setFormSeasonRoles((prev) => {
      const copy = { ...prev };
      if (copy[yr] !== undefined) {
        if (Object.keys(copy).length === 1) return prev;
        delete copy[yr];
        return copy;
      } else {
        return { ...copy, [yr]: "" };
      }
    });
  };

  const handleRoleChangeForSeason = (yr, value) => {
    setFormSeasonRoles((prev) => ({
      ...prev,
      [yr]: value,
    }));
  };

  const handleSaveMember = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!formName.trim()) {
      showToast("Please provide the full name.");
      return;
    }

    const seasons = Object.keys(formSeasonRoles);
    if (seasons.length === 0) {
      showToast("Please select at least one season.");
      return;
    }
    if (!["M", "F"].includes(formSex)) {
      showToast("Choose Male or Female.");
      return;
    }

    let assignments;
    try {
      assignments = seasons.map((season) => createTeamAssignment(season, formSeasonRoles[season]));
    } catch (validationError) {
      showToast(validationError.message || "Check the selected seasons and roles.");
      return;
    }

    setSaving(true);

    const uploadedUrls = [];
    let databaseSaved = false;
    try {
      showToast("Saving record to database...");

      let finalAvatarUrl = avatarPreview;
      if (avatarFile) {
        const uploaded = await uploadMedia(supabase, avatarFile, "AVATARS");
        finalAvatarUrl = uploaded.url;
        uploadedUrls.push(uploaded.url);
      }

      let finalNormalImageUrl = normalImagePreview;
      if (normalImageFile) {
        const uploaded = await uploadMedia(supabase, normalImageFile, "PHOTOS");
        finalNormalImageUrl = uploaded.url;
        uploadedUrls.push(uploaded.url);
      }

      const socialLinks = {
        instagram: formInstagram.trim(),
        linkedin: formLinkedin.trim(),
        github: formGithub.trim(),
      };

      // Permanent member info — ONLY for 'team' table
      const teamPayload = {
        full_name: formName.trim(),
        department: formFiliere || "Génie Informatique",
        avatar_img: finalAvatarUrl || "",
        normal_img: finalNormalImageUrl || "",
        birthday: formBirthday ? formBirthday : null,
        social_media_links: socialLinks,
        sex: formSex,
      };

      await saveStaff(supabase, editingMember?.id, teamPayload, assignments);
      databaseSaved = true;

      if (editingMember) {
        const previousUrls = [];
        const oldAvatar = getMemberAvatarSource(editingMember);
        const oldPhoto = getMemberNormal(editingMember);
        if (oldAvatar && oldAvatar !== finalAvatarUrl) previousUrls.push(oldAvatar);
        if (oldPhoto && oldPhoto !== finalNormalImageUrl) previousUrls.push(oldPhoto);
        await deleteMediaUrls(supabase, previousUrls);
      }

      await loadTeamData();
      showToast(editingMember ? "Staff profile, seasons, and R2 media updated." : "Staff profile added with its R2 media.");
      setIsModalOpen(false);
    } catch (err) {
      if (!databaseSaved && uploadedUrls.length) {
        try {
          await deleteMediaUrls(supabase, uploadedUrls);
        } catch (cleanupError) {
          showToast(`Error saving profile: ${err?.message || "Unknown error"}. New R2 media also needs manual cleanup: ${cleanupError.message}`);
          return;
        }
      }
      if (databaseSaved) {
        await loadTeamData();
        setIsModalOpen(false);
        showToast(`Profile saved, but old R2 media cleanup failed: ${err?.message || "Unknown error"}`);
      } else {
        showToast("Error saving profile: " + (err?.message || ""));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (member) => {
    if (!member) return;
    const memberYears = getMemberYears(member);
    const hasMultipleSeasons = memberYears.length > 1;

    let deleteSeasonOnly = false;

    if (hasMultipleSeasons) {
      const choice = window.confirm(
        `Member "${getMemberName(member)}" has records across multiple seasons (${memberYears.join(", ")}).\n\n` +
        `Click OK to remove them ONLY from season "${selectedYear}" (preserves records in other seasons).\n` +
        `Click Cancel if you do not want to remove them.`
      );
      if (!choice) return;
      deleteSeasonOnly = true;
    } else {
      if (!window.confirm(`Confirm complete deletion of member "${getMemberName(member)}"?`)) return;
    }

    try {
      await deleteStaff(supabase, member.id, deleteSeasonOnly ? selectedYear : null);
      if (!deleteSeasonOnly) {
        try {
          const cleanup = await deleteMediaUrls(supabase, [getMemberAvatarSource(member), getMemberNormal(member)]);
          showToast(cleanup.some((result) => result.deleted)
            ? "Staff profile and managed R2 media deleted."
            : "Staff profile deleted. External or legacy media was left untouched.");
        } catch (cleanupError) {
          showToast(`Staff profile deleted, but its R2 media cleanup failed: ${cleanupError.message}`);
        }
      } else {
        showToast("Staff member removed from this season.");
      }
      await loadTeamData();
    } catch (err) {
      console.warn("Delete error:", err);
      showToast("Error deleting member.");
    }
  };

  const handlePermanentDelete = async (memberId) => {
    if (!window.confirm("Are you sure you want to permanently delete this member from all seasons? This action cannot be undone.")) return;

    try {
      const member = members.find((item) => String(item.id) === String(memberId));
      await deleteStaff(supabase, memberId);
      let cleanupWarning = "";
      let managedMediaDeleted = false;
      try {
        const cleanup = await deleteMediaUrls(supabase, [getMemberAvatarSource(member), getMemberNormal(member)]);
        managedMediaDeleted = cleanup.some((result) => result.deleted);
      } catch (cleanupError) {
        cleanupWarning = cleanupError.message;
      }
      setIsProfileModalOpen(false);
      await loadTeamData();
      showToast(cleanupWarning
        ? `Member deleted, but their R2 media cleanup failed: ${cleanupWarning}`
        : managedMediaDeleted
          ? "Member permanently deleted with their managed R2 media."
          : "Member permanently deleted. External or legacy media was left untouched.");
    } catch (err) {
      showToast("Delete error: " + err.message);
    }
  };

  // Filtered members by year, search, and ordered by post_order
  const filteredList = members
    .filter((m) => {
      const mYears = getMemberYears(m);
      const isYear = mYears.includes(selectedYear);

      const name = getMemberName(m).toLowerCase();
      const role = (getMemberRoleForYear(m, selectedYear) || "").toLowerCase();
      const filiere = getMemberFiliere(m).toLowerCase();
      const query = searchQuery.toLowerCase();

      const matchesSearch = name.includes(query) || role.includes(query) || filiere.includes(query);
      return isYear && matchesSearch;
    })
    .sort((a, b) => {
      const orderA = getMemberPostOrder(a, selectedYear);
      const orderB = getMemberPostOrder(b, selectedYear);
      if (orderA !== orderB) return orderA - orderB;

      const roleA = getMemberRoleForYear(a, selectedYear);
      const roleB = getMemberRoleForYear(b, selectedYear);
      const priorityA = getRolePriority(roleA);
      const priorityB = getRolePriority(roleB);
      if (priorityA !== priorityB) return priorityA - priorityB;
      return getMemberName(a).localeCompare(getMemberName(b));
    });

  return (
    <div className="admin-tab-content">
      {/* Toast Notification */}
      {toastMsg && <div className="admin-toast-bar" role="status">{toastMsg}</div>}

      {/* Page Header */}
      <div className="admin-view-header">
        <div>
          <h1 className="admin-page-title">Staff & leadership</h1>
          <p className="admin-page-desc">
            Manage public profiles, leadership roles, and season assignments.
          </p>
        </div>

        <div className="admin-header-actions">
          <button type="button" className="btn-secondary" onClick={loadTeamData} disabled={loading}>Refresh staff</button>
          <button type="button" className="btn-primary" onClick={handleOpenAdd} disabled={Boolean(loadError)}>
            Add staff officer
          </button>
        </div>
      </div>

      {/* Filter Bar: Seasons Pills + Search Input */}
      <div className="member-filters-bar">
        <div className="filter-pills-row">
          {yearsList.map((yr) => {
            const count = members.filter((m) => {
              const mYears = getMemberYears(m);
              return mYears.includes(yr);
            }).length;

            return (
              <button
                key={yr}
                type="button"
                className={`filter-pill-btn ${selectedYear === yr ? "is-active" : ""}`}
                onClick={() => setSelectedYear(yr)}
              >
                <span>{yr}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", marginLeft: "4px", color: "var(--text-muted)" }}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ width: "240px" }}>
          <input
            type="text"
            placeholder="Search member, role, department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-text-input"
            style={{ padding: "6px 10px", fontSize: "12px" }}
          />
        </div>
      </div>

      {/* Members Drafting Grid */}
      {loadError && <div className="admin-inline-error" role="alert">{loadError}</div>}
      {loading ? (
        <div className="members-drafting-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="member-drafting-card" style={{ minHeight: "170px", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="skeleton-shimmer skeleton-circle" />
                <div className="skeleton-shimmer skeleton-line" style={{ width: "36px", height: "18px" }} />
              </div>
              <div className="skeleton-shimmer skeleton-line" style={{ width: "70%", height: "16px" }} />
              <div className="skeleton-shimmer skeleton-line" style={{ width: "50%", height: "12px" }} />
              <div className="skeleton-shimmer skeleton-line" style={{ width: "40%", height: "10px" }} />
              <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between" }}>
                <div className="skeleton-shimmer skeleton-line" style={{ width: "50px", height: "12px" }} />
                <div className="skeleton-shimmer skeleton-line" style={{ width: "30px", height: "12px" }} />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? null : filteredList.length === 0 ? (
        <div className="admin-panel" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
          <p style={{ margin: "0 0 12px" }}>No members registered for {selectedYear}.</p>
          <button type="button" className="btn-secondary" onClick={handleOpenAdd}>
            Add member to {selectedYear}
          </button>
        </div>
      ) : (
        <div className="members-drafting-grid">
          {filteredList.map((m) => {
            const avatar = getMemberAvatar(m);
            const name = getMemberName(m);
            const currentSeasonRole = getMemberRoleForYear(m, selectedYear);
            const filiere = getMemberFiliere(m);
            const seasonRoles = getMemberSeasonRoles(m);

            return (
              <div
                key={m.id}
                className="member-drafting-card"
                onClick={() => handleOpenProfile(m)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpenProfile(m);
                  }
                }}
              >
                <div className="member-card-header">
                  <div className="member-avatar-box">
                    <img src={avatar} alt={name} className="member-avatar-img" loading="lazy" />
                  </div>

                </div>

                <h3 className="member-card-title">{name}</h3>
                <div className="member-card-role-text">{currentSeasonRole}</div>
                {filiere && <div className="member-card-dept-text">{filiere}</div>}

                <div className="member-card-foot-row">
                  <span>{Object.keys(seasonRoles).length} {Object.keys(seasonRoles).length === 1 ? "season" : "seasons"}</span>

                  <div className="member-card-quick-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-hairline-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(m);
                      }}
                      title="Edit member"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn-hairline-icon btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMember(m);
                      }}
                      title="Delete member or remove from season"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Member Profile Details Inspection Modal */}
      {isProfileModalOpen && selectedProfileMember && (
        <div className="admin-modal-overlay" onClick={() => setIsProfileModalOpen(false)}>
          <div className="admin-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Member profile specification</h2>
              <button
                type="button"
                className="admin-modal-close-btn"
                onClick={() => setIsProfileModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div className="admin-modal-body">
              {/* Profile Top Hero Block */}
              <div className="profile-details-hero">
                <img
                  src={getMemberAvatar(selectedProfileMember)}
                  alt={getMemberName(selectedProfileMember)}
                  className="profile-avatar-large"
                />
                <div className="profile-meta-block">
                  <h3 className="profile-fullname">{getMemberName(selectedProfileMember)}</h3>
                  <div className="profile-role-primary">
                    {getMemberRoleForYear(selectedProfileMember, selectedYear)} ({selectedYear})
                  </div>
                  <div className="profile-dept-info">{getMemberFiliere(selectedProfileMember) || "EST Safi"}</div>
                  <div className="profile-dept-info">{getMemberSex(selectedProfileMember) === "F" ? "Female" : "Male"}</div>
                  {selectedProfileMember.birthday && (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                      🎂 Birthday: {selectedProfileMember.birthday}
                    </div>
                  )}
                </div>
              </div>

              {/* Career & Active Seasons Timeline Table */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "8px" }}>
                  Active seasons & assigned positions
                </div>
                <table className="profile-timeline-table">
                  <thead>
                    <tr>
                      <th>Season</th>
                      <th>Assigned role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getMemberSeasonAssignments(selectedProfileMember).map((ts) => (
                        <tr key={ts.season}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text)" }}>
                            {ts.season}
                          </td>
                          <td>{ts.role}</td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Social Media Links */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "8px" }}>
                  Technical profiles & links
                </div>
                {(() => {
                  const socials = getMemberSocials(selectedProfileMember);
                  const hasSocials = socials.linkedin || socials.github || socials.instagram;
                  if (!hasSocials) {
                    return <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No external links provided.</div>;
                  }
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {socials.linkedin && (
                        <div style={{ fontSize: "12px" }}>
                          <span style={{ color: "var(--text-muted)" }}>LinkedIn: </span>
                          <a href={socials.linkedin} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                            {socials.linkedin}
                          </a>
                        </div>
                      )}
                      {socials.github && (
                        <div style={{ fontSize: "12px" }}>
                          <span style={{ color: "var(--text-muted)" }}>GitHub: </span>
                          <a href={socials.github} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                            {socials.github}
                          </a>
                        </div>
                      )}
                      {socials.instagram && (
                        <div style={{ fontSize: "12px" }}>
                          <span style={{ color: "var(--text-muted)" }}>Instagram: </span>
                          <a href={socials.instagram} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                            {socials.instagram}
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Database metadata */}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid var(--border)", fontSize: "11px", color: "var(--text-muted)" }}>
                <span>Record ID: <span style={{ fontFamily: "var(--font-mono)" }}>{selectedProfileMember.id || "N/A"}</span></span>
                {selectedProfileMember.created_at && (
                  <span>Created: {new Date(selectedProfileMember.created_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={() => handlePermanentDelete(selectedProfileMember.id)}
                title="Permanently delete member from all seasons and database"
              >
                Delete completely
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsProfileModalOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const m = selectedProfileMember;
                  setIsProfileModalOpen(false);
                  handleOpenEdit(m);
                }}
              >
                Edit member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Member Form Modal */}
      {isModalOpen && (
        <div className="admin-modal-overlay" role="presentation">
          <div
            className="admin-modal-dialog admin-team-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-editor-title"
          >
            <div className="admin-modal-header">
              <h2 id="team-editor-title" className="admin-modal-title">
                {editingMember ? "Edit member profile" : "Add member profile"}
              </h2>
              <button type="button" className="admin-modal-close-btn" onClick={() => setIsModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveMember} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div className="admin-modal-body">
                {/* Controlled profile fields */}
                <div className="admin-team-profile-fields">
                  <div className="form-field-group">
                    <label className="form-field-label">Full name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Imrane Errafi"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="form-text-input"
                    />
                  </div>

                  <div className="form-field-group">
                    <label className="form-field-label">Department / Filière *</label>
                    <select
                      value={formFiliere}
                      onChange={(e) => setFormFiliere(e.target.value)}
                      className="form-select-input"
                    >
                      {FILIERES.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field-group">
                    <label className="form-field-label">Date of birth (Optional)</label>
                    <input
                      type="date"
                      value={formBirthday}
                      onChange={(e) => setFormBirthday(e.target.value)}
                      className="form-text-input"
                    />
                  </div>

                  <div className="form-field-group">
                    <label className="form-field-label">Sex *</label>
                    <select
                      required
                      value={formSex}
                      onChange={(e) => setFormSex(e.target.value)}
                      className="form-select-input"
                    >
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </div>
                </div>

                {/* Member Portraits Import */}
                <div className="form-field-group">
                  <label className="form-field-label">Member portraits & imagery</label>
                  <div className="member-image-upload-grid">
                    {/* Slot 1: Avatar Illustration */}
                    <div className="image-import-slot">
                      <div className="image-import-slot-header">
                        <span className="image-import-slot-label">Avatar illustration</span>
                        <span className="image-import-tag">Primary</span>
                      </div>

                      <div className="image-import-content">
                        <div className="image-import-preview-box">
                          {avatarPreview ? (
                            <img src={avatarPreview} alt="Avatar preview" className="image-import-preview-img" />
                          ) : (
                            <div className="image-import-placeholder">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="image-import-controls">
                          <input
                            type="file"
                            ref={avatarInputRef}
                            accept="image/*"
                            onChange={handleAvatarFileChange}
                            style={{ display: "none" }}
                          />
                          <button
                            type="button"
                            className="image-import-action-btn"
                            onClick={() => avatarInputRef.current?.click()}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            <span>{avatarPreview ? "Replace avatar" : "Import avatar"}</span>
                          </button>

                          {avatarPreview && (
                            <button type="button" className="image-import-clear-btn" onClick={handleClearAvatar}>
                              Remove avatar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Slot 2: Real Photo */}
                    <div className="image-import-slot">
                      <div className="image-import-slot-header">
                        <span className="image-import-slot-label">Real photo</span>
                        <span className="image-import-tag">Optional</span>
                      </div>

                      <div className="image-import-content">
                        <div className="image-import-preview-box">
                          {normalImagePreview ? (
                            <img src={normalImagePreview} alt="Photo preview" className="image-import-preview-img" />
                          ) : (
                            <div className="image-import-placeholder">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="image-import-controls">
                          <input
                            type="file"
                            ref={normalImageInputRef}
                            accept="image/*"
                            onChange={handleNormalFileChange}
                            style={{ display: "none" }}
                          />
                          <button
                            type="button"
                            className="image-import-action-btn"
                            onClick={() => normalImageInputRef.current?.click()}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            <span>{normalImagePreview ? "Replace photo" : "Import photo"}</span>
                          </button>

                          {normalImagePreview && (
                            <button type="button" className="image-import-clear-btn" onClick={handleClearNormal}>
                              Remove photo
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seasons & Assigned Roles */}
                <div className="form-field-group">
                  <label className="form-field-label">
                    Active seasons & posts
                  </label>

                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
                    {yearsList.map((yr) => {
                      const isSelected = formSeasonRoles[yr] !== undefined;
                      return (
                        <button
                          key={yr}
                          type="button"
                          className={`btn-secondary ${isSelected ? "btn-primary" : ""}`}
                          onClick={() => handleToggleSeason(yr)}
                          style={{ padding: "5px 12px", fontSize: "12px", fontWeight: isSelected ? 600 : 400 }}
                        >
                          {isSelected ? "✓ " : "+ "}{yr}
                        </button>
                      );
                    })}
                  </div>

                  <div className="admin-team-season-header">
                    <span>Season</span>
                    <span>Assigned post *</span>
                  </div>

                  <div className="admin-team-season-fields">
                    {Object.keys(formSeasonRoles).sort((a, b) => TEAM_SEASONS.indexOf(a) - TEAM_SEASONS.indexOf(b)).map((yr) => (
                      <div key={yr} className="admin-team-season-row">
                        <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text)", fontWeight: 600 }}>
                          {yr}
                        </span>
                        <select
                          required
                          value={formSeasonRoles[yr] || ""}
                          onChange={(e) => handleRoleChangeForSeason(yr, e.target.value)}
                          className="form-select-input"
                        >
                          <option value="">Choose a post</option>
                          {TEAM_POSTS.map((post) => (
                            <option key={post.role} value={post.role}>{post.role}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Social Media Links */}
                <div className="form-field-group">
                  <label className="form-field-label">Social & technical links</label>
                  <input
                    type="url"
                    placeholder="LinkedIn URL"
                    value={formLinkedin}
                    onChange={(e) => setFormLinkedin(e.target.value)}
                    className="form-text-input"
                    style={{ marginBottom: "6px" }}
                  />
                  <input
                    type="url"
                    placeholder="GitHub URL"
                    value={formGithub}
                    onChange={(e) => setFormGithub(e.target.value)}
                    className="form-text-input"
                    style={{ marginBottom: "6px" }}
                  />
                  <input
                    type="url"
                    placeholder="Instagram URL"
                    value={formInstagram}
                    onChange={(e) => setFormInstagram(e.target.value)}
                    className="form-text-input"
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving record..." : editingMember ? "Save profile" : "Add member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
