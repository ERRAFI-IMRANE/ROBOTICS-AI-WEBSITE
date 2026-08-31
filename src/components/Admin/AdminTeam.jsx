import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import "./AdminDashboard.css";

const PRESET_YEARS = ["2025-2026", "2024-2025", "2023-2024"];
const FILIERES = [
  "Génie Informatique",
  "Génie Électrique (GIME)",
  "Génie Industriel & Maintenance",
  "Techniques de Management",
];

// Helper to extract years array from member record
const getMemberYears = (m) => {
  if (m?.season_roles && typeof m.season_roles === "object" && Object.keys(m.season_roles).length > 0) {
    return Object.keys(m.season_roles);
  }
  const rawYears = m?.years || m?.data?.years;
  if (Array.isArray(rawYears) && rawYears.length > 0) {
    return rawYears.map(String);
  }
  if (typeof rawYears === "string" && rawYears) {
    return rawYears.split(",").map((s) => s.trim());
  }
  if (m?.year || m?.data?.year) {
    return String(m.year || m.data?.year).split(",").map((s) => s.trim());
  }
  return ["2025-2026"];
};

// Helper to get season roles mapping { [year]: role }
const getMemberSeasonRoles = (m) => {
  if (m?.season_roles && typeof m.season_roles === "object" && Object.keys(m.season_roles).length > 0) {
    return { ...m.season_roles };
  }
  const years = getMemberYears(m);
  const fallbackRole = m?.post || m?.role || m?.data?.role || "Team Member";
  const map = {};
  years.forEach((yr) => {
    map[yr] = fallbackRole;
  });
  return map;
};

// Helper to get role for a specific year
const getMemberRoleForYear = (m, year) => {
  const seasonRoles = getMemberSeasonRoles(m);
  if (year && seasonRoles[year]) {
    return seasonRoles[year];
  }
  const allRoles = Object.values(seasonRoles);
  if (allRoles.length > 0 && allRoles[0]) {
    return allRoles[0];
  }
  return m?.post || m?.role || m?.data?.role || "Team Member";
};

// Priority rank helper for hierarchy
const getRolePriority = (roleStr = "") => {
  const role = String(roleStr || "").toLowerCase().trim();
  if (!role) return 999;

  if (role.includes("co-sup") || role.includes("co-supervisor")) return 2;
  if (role.includes("sup") || role.includes("supervisor")) return 1;
  if (role.includes("adv") || role.includes("advisor")) return 3;
  if (role.includes("vp") || role.includes("vice")) return 5;
  if (role.includes("pres") || role.includes("president")) return 4;
  if (role.includes("mentor")) return 6;
  if (role.includes("lead") || role.includes("head") || role.includes("chef")) return 10;
  return 100;
};

const getMemberName = (m) => m?.full_name || m?.name || m?.data?.name || "Member";
const getMemberFiliere = (m) => m?.department || m?.filiere || m?.data?.filiere || "";
const getMemberAvatar = (m) => m?.avatar_img || m?.image || m?.image_url || m?.data?.image || "/Imrane_anime.png";
const getMemberNormal = (m) => m?.normal_img || m?.normal_image || m?.normalImage || m?.hover_image || m?.hoverImage || m?.data?.normalImage || "";
const getMemberSocials = (m) => m?.social_media_links || m?.links || m?.socials || m?.data?.socials || {};

// Helper to extract post order attribute for a specific season
const getMemberPostOrder = (m, season) => {
  if (!m) return Infinity;
  const data = m.data || {};
  const orderSources = [
    m.order_post,
    m.post_order,
    data.order_post,
    data.post_order,
    m.order,
    data.order,
    m.orderPost,
    m.postOrder,
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

export default function AdminTeam() {
  const [activeSubTab, setActiveSubTab] = useState("staff"); // "staff" | "registrations"
  const [members, setMembers] = useState([]);
  const [applicants, setApplicants] = useState([]);
  const [yearsList, setYearsList] = useState(PRESET_YEARS);
  const [selectedYear, setSelectedYear] = useState("2025-2026");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile Details Inspection Modal
  const [selectedProfileMember, setSelectedProfileMember] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Member Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [formName, setFormName] = useState("");
  const [formFiliere, setFormFiliere] = useState(FILIERES[0]);
  const [formSeasonRoles, setFormSeasonRoles] = useState({ "2025-2026": "" });
  const [showCustomYearInput, setShowCustomYearInput] = useState(false);
  const [customYearValue, setCustomYearValue] = useState("");

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
    setAvatarPreview("/Imrane_anime.png");
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

  // Refusal Modal State
  const [refusalModalOpen, setRefusalModalOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [refusalReason, setRefusalReason] = useState("");

  const [toastMsg, setToastMsg] = useState(null);

  const loadTeamData = async () => {
    try {
      setLoading(true);

      let { data, error } = await supabase
        .from("team")
        .select("*")
        .order("id", { ascending: false });

      if (error || !data) {
        const retryRes = await supabase.from("team").select("*");
        if (!retryRes.error && retryRes.data) {
          data = retryRes.data;
        }
      }

      const rows = data && Array.isArray(data) ? data : [];
      setMembers(rows);

      const combinedYearsSet = new Set(PRESET_YEARS);
      rows.forEach((m) => {
        const mYears = getMemberYears(m);
        mYears.forEach((yr) => yr && combinedYearsSet.add(yr));
      });

      const sortedYears = Array.from(combinedYearsSet).sort().reverse();
      setYearsList(sortedYears);

      if (sortedYears.length > 0 && !sortedYears.includes(selectedYear)) {
        setSelectedYear(sortedYears[0]);
      }
    } catch (err) {
      console.warn("Could not fetch team from database:", err);
      setMembers([]);
    } finally {
      setLoading(false);
    }

    // Load registrations
    const savedApplicants = localStorage.getItem("rai_admin_registrations");
    if (savedApplicants) {
      try {
        setApplicants(JSON.parse(savedApplicants));
      } catch {
        setApplicants([]);
      }
    } else {
      setApplicants([]);
    }
  };

  useEffect(() => {
    loadTeamData();
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const uploadImageToSupabase = async (file, folder = "team") => {
    if (!file) return null;

    const fileExt = file.name.split(".").pop() || "jpg";
    const cleanName = file.name.replace(/[^a-zA-Z0-9]/g, "_");
    const filePath = `${folder}/${Date.now()}_${cleanName}.${fileExt}`;

    const storageBuckets = ["EVENTS", "team", "images", "avatars", "public"];
    let publicUrl = null;

    for (const bucket of storageBuckets) {
      try {
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, file, { cacheControl: "3600", upsert: true });

        if (!uploadError) {
          const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
          if (data?.publicUrl) {
            publicUrl = data.publicUrl;
            break;
          }
        }
      } catch {
        // Try next
      }
    }

    if (!publicUrl) {
      publicUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }

    return publicUrl;
  };

  const handleOpenAdd = () => {
    setEditingMember(null);
    setFormName("");
    const initialYear = selectedYear || "2025-2026";
    setFormSeasonRoles({ [initialYear]: "" });
    setFormFiliere(FILIERES[0]);
    setShowCustomYearInput(false);
    setCustomYearValue("");

    setAvatarFile(null);
    setAvatarPreview("/Imrane_anime.png");
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

    const sRoles = getMemberSeasonRoles(m);
    const activeRoles = Object.keys(sRoles).length > 0 ? sRoles : { [selectedYear || "2025-2026"]: "" };
    setFormSeasonRoles(activeRoles);

    setShowCustomYearInput(false);
    setCustomYearValue("");

    setAvatarFile(null);
    setAvatarPreview(getMemberAvatar(m));
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
        const existingRole = Object.values(copy)[0] || "";
        return { ...copy, [yr]: existingRole };
      }
    });
  };

  const handleRoleChangeForSeason = (yr, value) => {
    setFormSeasonRoles((prev) => ({
      ...prev,
      [yr]: value,
    }));
  };

  const handleAddCustomYear = () => {
    const trimmed = customYearValue.trim();
    if (!trimmed) return;
    if (!yearsList.includes(trimmed)) {
      setYearsList((prev) => Array.from(new Set([trimmed, ...prev])).sort().reverse());
    }
    setFormSeasonRoles((prev) => ({
      ...prev,
      [trimmed]: Object.values(prev)[0] || "",
    }));
    setCustomYearValue("");
    setShowCustomYearInput(false);
  };

  const handleSaveMember = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast("Please provide the full name.");
      return;
    }

    const seasons = Object.keys(formSeasonRoles);
    if (seasons.length === 0) {
      showToast("Please select at least one season.");
      return;
    }

    const cleanSeasonRoles = {};
    seasons.forEach((yr) => {
      cleanSeasonRoles[yr] = formSeasonRoles[yr]?.trim() || "Team Member";
    });

    setSaving(true);

    try {
      showToast("Saving record to database...");

      let finalAvatarUrl = avatarPreview;
      if (avatarFile) {
        finalAvatarUrl = await uploadImageToSupabase(avatarFile, "avatars");
      }

      let finalNormalImageUrl = normalImagePreview;
      if (normalImageFile) {
        finalNormalImageUrl = await uploadImageToSupabase(normalImageFile, "photos");
      }

      const socialLinks = {
        instagram: formInstagram.trim(),
        linkedin: formLinkedin.trim(),
        github: formGithub.trim(),
      };

      const dbPayload = {
        full_name: formName.trim(),
        department: formFiliere || "Génie Informatique",
        avatar_img: finalAvatarUrl || "/Imrane_anime.png",
        normal_img: finalNormalImageUrl || "",
        social_media_links: socialLinks,
        season_roles: cleanSeasonRoles,
      };

      if (editingMember) {
        const { data, error } = await supabase
          .from("team")
          .update(dbPayload)
          .eq("id", editingMember.id)
          .select();

        if (error) {
          showToast("Error updating profile: " + error.message);
          return;
        }

        const updatedRecord = data && data[0] ? data[0] : { ...editingMember, ...dbPayload };
        setMembers((prev) => prev.map((m) => (m.id === editingMember.id ? updatedRecord : m)));
        showToast("Profile record updated.");
      } else {
        const { data, error } = await supabase
          .from("team")
          .insert([dbPayload])
          .select();

        if (error) {
          showToast("Error saving to database: " + error.message);
          return;
        }

        if (data && data[0]) {
          setMembers((prev) => [data[0], ...prev]);
          showToast("Member profile added.");
        } else {
          await loadTeamData();
          showToast("Member profile saved.");
        }
      }

      setIsModalOpen(false);
    } catch (err) {
      showToast("Error saving profile: " + (err?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (id) => {
    if (!window.confirm("Confirm deletion of this member record?")) return;

    try {
      const { error } = await supabase.from("team").delete().eq("id", id);
      if (error) {
        showToast("Error deleting: " + error.message);
        return;
      }
    } catch (err) {
      console.warn("Delete error:", err);
    }

    const updated = members.filter((m) => m.id !== id);
    setMembers(updated);
    showToast("Member profile removed.");
  };

  const handleAcceptApplicant = async (app) => {
    const updatedApplicants = applicants.map((a) => (a.id === app.id ? { ...a, status: "Accepted" } : a));
    setApplicants(updatedApplicants);
    localStorage.setItem("rai_admin_registrations", JSON.stringify(updatedApplicants));

    const newMemberPayload = {
      full_name: app.name,
      department: app.filiere,
      avatar_img: "/Imrane_anime.png",
      normal_img: "",
      social_media_links: { linkedin: "", instagram: "", github: "" },
      season_roles: { "2025-2026": `Member - ${app.filiere.split(" ")[0]}` },
    };

    try {
      const { data, error } = await supabase.from("team").insert([newMemberPayload]).select();
      if (!error && data && data[0]) {
        setMembers((prev) => [data[0], ...prev]);
        showToast(`Accepted ${app.name} into roster.`);
      }
    } catch {
      showToast(`Accepted ${app.name} into roster.`);
    }
  };

  const handleConfirmRefusal = (e) => {
    e.preventDefault();
    if (!selectedApplicant) return;

    const updatedApplicants = applicants.map((a) =>
      a.id === selectedApplicant.id
        ? { ...a, status: "Refused", refusalReason: refusalReason.trim() || "Criteria not met for this cycle" }
        : a
    );

    setApplicants(updatedApplicants);
    localStorage.setItem("rai_admin_registrations", JSON.stringify(updatedApplicants));
    setRefusalModalOpen(false);
    showToast(`Application for ${selectedApplicant.name} declined.`);
  };

  // Filtered members by year, search, and ordered by post_order
  const filteredList = members
    .filter((m) => {
      const mYears = getMemberYears(m);
      const isYear = mYears.includes(selectedYear) || (selectedYear === "2025-2026" && mYears.includes("2025"));

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

  const pendingCount = applicants.filter((a) => a.status === "Pending").length;

  return (
    <div className="admin-tab-content">
      {/* Toast Notification */}
      {toastMsg && <div className="admin-toast-bar">{toastMsg}</div>}

      {/* Page Header */}
      <div className="admin-view-header">
        <div>
          <h1 className="admin-page-title">Members & leadership</h1>
          <p className="admin-page-desc">
            Club executive officers, engineers, and student recruitment queue.
          </p>
        </div>

        <div className="admin-header-actions">
          {activeSubTab === "staff" && (
            <button type="button" className="btn-primary" onClick={handleOpenAdd}>
              Add member
            </button>
          )}
        </div>
      </div>

      {/* Sub Tab Switcher */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
        <button
          type="button"
          className={`btn-secondary ${activeSubTab === "staff" ? "btn-primary" : ""}`}
          onClick={() => setActiveSubTab("staff")}
          style={{ fontSize: "13px" }}
        >
          Staff & leadership ({members.length})
        </button>

        <button
          type="button"
          className={`btn-secondary ${activeSubTab === "registrations" ? "btn-primary" : ""}`}
          onClick={() => setActiveSubTab("registrations")}
          style={{ fontSize: "13px" }}
        >
          Recruitment queue {pendingCount > 0 ? `(${pendingCount} pending)` : `(${applicants.length})`}
        </button>
      </div>

      {activeSubTab === "registrations" ? (
        /* Recruitment Applications Queue */
        <div className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3 className="admin-panel-heading">Recruitment applications</h3>
              <p className="admin-panel-meta">Student admissions queue from club portal</p>
            </div>
          </div>

          <div className="table-container">
            <table className="hairline-table">
              <thead>
                <tr>
                  <th>Student applicant</th>
                  <th>Department / Filière</th>
                  <th>Skills & motivation</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {applicants.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
                      No incoming student registrations logged yet.
                    </td>
                  </tr>
                ) : (
                  applicants.map((app) => (
                    <tr key={app.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{app.name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{app.email}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: "12px", color: "var(--accent)" }}>{app.filiere}</span>
                      </td>
                      <td>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{app.skills}</div>
                        <div style={{ fontSize: "12px", color: "var(--text)" }}>&ldquo;{app.motivation}&rdquo;</div>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>{app.appliedDate}</td>
                      <td>
                        <span
                          className={`status-chip status-chip-${
                            app.status === "Accepted" ? "positive" : app.status === "Refused" ? "critical" : "warning"
                          }`}
                        >
                          <span className="status-chip-dot" />
                          <span>{app.status}</span>
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {app.status === "Pending" ? (
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => handleAcceptApplicant(app)}
                              style={{ padding: "4px 8px", fontSize: "12px" }}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-danger"
                              onClick={() => {
                                setSelectedApplicant(app);
                                setRefusalReason("");
                                setRefusalModalOpen(true);
                              }}
                              style={{ padding: "4px 8px", fontSize: "12px" }}
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Processed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Staff Roster Grid View */
        <>
          {/* Filter Bar: Seasons Pills + Search Input */}
          <div className="member-filters-bar">
            <div className="filter-pills-row">
              {yearsList.map((yr) => {
                const count = members.filter((m) => {
                  const mYears = getMemberYears(m);
                  return mYears.includes(yr) || (yr === "2025-2026" && mYears.includes("2025"));
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
          {loading ? (
            <div className="admin-panel" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              <span>Connecting to database & loading roster...</span>
            </div>
          ) : filteredList.length === 0 ? (
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
                const orderValue = getMemberPostOrder(m, selectedYear);

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

                      {orderValue !== Infinity && (
                        <span className="member-card-order-tag">
                          #{orderValue}
                        </span>
                      )}
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
                            handleDeleteMember(m.id);
                          }}
                          title="Delete member"
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
        </>
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
                      <th style={{ textAlign: "right" }}>Post order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(getMemberSeasonRoles(selectedProfileMember)).map(([yr, role]) => {
                      const yrOrder = getMemberPostOrder(selectedProfileMember, yr);
                      return (
                        <tr key={yr}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text)" }}>
                            {yr}
                          </td>
                          <td>{role}</td>
                          <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                            {yrOrder !== Infinity ? `#${yrOrder}` : "Default"}
                          </td>
                        </tr>
                      );
                    })}
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
                onClick={() => {
                  const id = selectedProfileMember.id;
                  setIsProfileModalOpen(false);
                  handleDeleteMember(id);
                }}
              >
                Delete member
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
        <div className="admin-modal-overlay">
          <div className="admin-modal-dialog">
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">
                {editingMember ? "Edit member profile" : "Add member profile"}
              </h2>
              <button type="button" className="admin-modal-close-btn" onClick={() => setIsModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveMember} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div className="admin-modal-body">
                {/* Full name & department */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
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
                                <circle cx="12" cy="8" r="4" />
                                <path d="M20 21a8 8 0 1 0-16 0" />
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
                            <span>{avatarPreview && avatarPreview !== "/Imrane_anime.png" ? "Replace avatar" : "Import avatar"}</span>
                          </button>

                          {avatarPreview && avatarPreview !== "/Imrane_anime.png" && (
                            <button type="button" className="image-import-clear-btn" onClick={handleClearAvatar}>
                              Reset to default
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
                    Active seasons & roles (select seasons to assign role)
                  </label>

                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                    {yearsList.map((yr) => {
                      const isSelected = formSeasonRoles[yr] !== undefined;
                      return (
                        <button
                          key={yr}
                          type="button"
                          className={`btn-secondary ${isSelected ? "btn-primary" : ""}`}
                          onClick={() => handleToggleSeason(yr)}
                          style={{ padding: "4px 8px", fontSize: "12px" }}
                        >
                          {yr}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowCustomYearInput((v) => !v)}
                      style={{ padding: "4px 8px", fontSize: "12px" }}
                    >
                      + Custom season
                    </button>
                  </div>

                  {showCustomYearInput && (
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <input
                        type="text"
                        placeholder="e.g. 2026-2027"
                        value={customYearValue}
                        onChange={(e) => setCustomYearValue(e.target.value)}
                        className="form-text-input"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleAddCustomYear}
                        disabled={!customYearValue.trim()}
                      >
                        Add
                      </button>
                    </div>
                  )}

                  {/* Input for each active season's role */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {Object.keys(formSeasonRoles).map((yr) => (
                      <div key={yr} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ width: "90px", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                          {yr}:
                        </span>
                        <input
                          type="text"
                          required
                          placeholder={`Role in ${yr} (e.g. President, AI Lead)`}
                          value={formSeasonRoles[yr] || ""}
                          onChange={(e) => handleRoleChangeForSeason(yr, e.target.value)}
                          className="form-text-input"
                          style={{ flex: 1 }}
                        />
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

      {/* Refusal Confirmation Modal */}
      {refusalModalOpen && selectedApplicant && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-dialog" style={{ maxWidth: "480px" }}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Decline registration</h2>
              <button type="button" className="admin-modal-close-btn" onClick={() => setRefusalModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmRefusal}>
              <div className="admin-modal-body">
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 12px" }}>
                  Provide reason for declining <strong>{selectedApplicant.name}</strong>&apos;s application:
                </p>

                <div className="form-field-group">
                  <label className="form-field-label">Decline notes *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Prerequisite lab experience not met for current embedded systems track..."
                    value={refusalReason}
                    onChange={(e) => setRefusalReason(e.target.value)}
                    className="form-textarea"
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setRefusalModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary btn-danger">
                  Confirm decline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
