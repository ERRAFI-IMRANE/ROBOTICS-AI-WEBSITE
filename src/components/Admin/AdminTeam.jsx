import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import "./AdminDashboard.css";

const PRESET_YEARS = ["24-25", "25-26", "26-27"];
const FILIERES = [
  "Génie Informatique",
  "Génie Électrique (GIME)",
  "Génie Industriel & Maintenance",
  "Techniques de Management",
];

// Helper to extract years array from member record
const getMemberYears = (m) => {
  if (Array.isArray(m?.team_seasons) && m.team_seasons.length > 0) {
    return m.team_seasons.map((ts) => ts.season).filter(Boolean);
  }
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
  return ["25-26"];
};

// Helper to get season roles mapping { [year]: role }
const getMemberSeasonRoles = (m) => {
  if (Array.isArray(m?.team_seasons) && m.team_seasons.length > 0) {
    const map = {};
    m.team_seasons.forEach((ts) => {
      if (ts.season) map[ts.season] = ts.role || "Team Member";
    });
    return map;
  }
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
  if (Array.isArray(m?.team_seasons) && m.team_seasons.length > 0) {
    const found = m.team_seasons.find((ts) => ts.season === year);
    if (found?.role) return found.role;
    if (year === "25-26") {
      const alt = m.team_seasons.find((ts) => ts.season === "2025-2026" || ts.season === "2025");
      if (alt?.role) return alt.role;
    }
    if (year === "24-25") {
      const alt = m.team_seasons.find((ts) => ts.season === "2024-2025" || ts.season === "2024");
      if (alt?.role) return alt.role;
    }
    if (year === "26-27") {
      const alt = m.team_seasons.find((ts) => ts.season === "2026-2027" || ts.season === "2026");
      if (alt?.role) return alt.role;
    }
    if (m.team_seasons[0]?.role) return m.team_seasons[0].role;
  }
  const seasonRoles = getMemberSeasonRoles(m);
  if (year && seasonRoles[year]) return seasonRoles[year];
  if (year === "25-26" && (seasonRoles["2025-2026"] || seasonRoles["2025"])) {
    return seasonRoles["2025-2026"] || seasonRoles["2025"];
  }
  if (year === "24-25" && (seasonRoles["2024-2025"] || seasonRoles["2024"])) {
    return seasonRoles["2024-2025"] || seasonRoles["2024"];
  }
  if (year === "26-27" && (seasonRoles["2026-2027"] || seasonRoles["2026"])) {
    return seasonRoles["2026-2027"] || seasonRoles["2026"];
  }
  return m?.post || m?.role || m?.data?.role || "Team Member";
};

// Helper to get post abbreviation for a year
const getMemberPostAbbr = (m, year) => {
  if (Array.isArray(m?.team_seasons) && m.team_seasons.length > 0) {
    const found = m.team_seasons.find((ts) => ts.season === year);
    if (found?.post_abbr) return found.post_abbr;
    if (year === "25-26") {
      const alt = m.team_seasons.find((ts) => ts.season === "2025-2026" || ts.season === "2025");
      if (alt?.post_abbr) return alt.post_abbr;
    }
    if (year === "24-25") {
      const alt = m.team_seasons.find((ts) => ts.season === "2024-2025" || ts.season === "2024");
      if (alt?.post_abbr) return alt.post_abbr;
    }
    if (year === "26-27") {
      const alt = m.team_seasons.find((ts) => ts.season === "2026-2027" || ts.season === "2026");
      if (alt?.post_abbr) return alt.post_abbr;
    }
  }
  if (m?.post_abbr && typeof m.post_abbr === "object" && m.post_abbr[year]) {
    return m.post_abbr[year];
  }
  return "";
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

// Helper to extract post order attribute for a specific season from team_seasons
const getMemberPostOrder = (m, season) => {
  if (!m) return Infinity;
  if (Array.isArray(m?.team_seasons) && m.team_seasons.length > 0) {
    const found = m.team_seasons.find((ts) => ts.season === season);
    if (found && found.post_order !== null && found.post_order !== undefined && !isNaN(Number(found.post_order))) {
      return Number(found.post_order);
    }
    if (season === "25-26") {
      const alt = m.team_seasons.find((ts) => ts.season === "2025-2026" || ts.season === "2025");
      if (alt && alt.post_order !== null && alt.post_order !== undefined && !isNaN(Number(alt.post_order))) {
        return Number(alt.post_order);
      }
    }
    if (season === "24-25") {
      const alt = m.team_seasons.find((ts) => ts.season === "2024-2025" || ts.season === "2024");
      if (alt && alt.post_order !== null && alt.post_order !== undefined && !isNaN(Number(alt.post_order))) {
        return Number(alt.post_order);
      }
    }
    if (season === "26-27") {
      const alt = m.team_seasons.find((ts) => ts.season === "2026-2027" || ts.season === "2026");
      if (alt && alt.post_order !== null && alt.post_order !== undefined && !isNaN(Number(alt.post_order))) {
        return Number(alt.post_order);
      }
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

export default function AdminTeam() {
  const [members, setMembers] = useState([]);
  const [yearsList, setYearsList] = useState(PRESET_YEARS);
  const [selectedYear, setSelectedYear] = useState("25-26");
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
  const [formBirthday, setFormBirthday] = useState("");
  const [formSeasonRoles, setFormSeasonRoles] = useState({ "25-26": "" });
  const [formPostAbbrs, setFormPostAbbrs] = useState({});
  const [formPostOrders, setFormPostOrders] = useState({});
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

  const [toastMsg, setToastMsg] = useState(null);

  const loadTeamData = async () => {
    try {
      setLoading(true);

      // Query team and embed all related team_seasons records (Staff ONLY)
      let { data, error } = await supabase
        .from("team")
        .select(`
          id,
          full_name,
          avatar_img,
          normal_img,
          birthday,
          department,
          social_media_links,
          team_seasons (
            id,
            team_id,
            season,
            role,
            post_abbr,
            post_order
          )
        `)
        .order("id", { ascending: false });

      if (error || !data) {
        // Fallback: simple team query
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
        mYears.forEach((yr) => {
          if (!yr) return;
          const str = String(yr).trim();
          if (str !== "23-24" && str !== "2023-2024" && str !== "2023" && str !== "23/24") {
            combinedYearsSet.add(str);
          }
        });
      });

      const sortedYears = Array.from(combinedYearsSet)
        .filter((yr) => yr !== "23-24" && yr !== "2023-2024" && yr !== "2023" && yr !== "23/24")
        .sort((a, b) => {
          const order = ["24-25", "25-26", "26-27"];
          const idxA = order.indexOf(a);
          const idxB = order.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
        });
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
    setFormFiliere(FILIERES[0]);
    setFormBirthday("");
    const initialYear = selectedYear || "25-26";
    setFormSeasonRoles({ [initialYear]: "" });
    setFormPostAbbrs({ [initialYear]: "" });
    setFormPostOrders({ [initialYear]: "" });
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
    setFormBirthday(m.birthday || "");

    const sRoles = getMemberSeasonRoles(m);
    const activeRoles = Object.keys(sRoles).length > 0 ? sRoles : { [selectedYear || "25-26"]: "" };
    setFormSeasonRoles(activeRoles);

    const abbrs = {};
    const orders = {};
    if (Array.isArray(m.team_seasons) && m.team_seasons.length > 0) {
      m.team_seasons.forEach((ts) => {
        abbrs[ts.season] = ts.post_abbr || "";
        orders[ts.season] = ts.post_order !== null && ts.post_order !== undefined ? String(ts.post_order) : "";
      });
    } else {
      Object.keys(activeRoles).forEach((yr) => {
        abbrs[yr] = getMemberPostAbbr(m, yr) || "";
        const ord = getMemberPostOrder(m, yr);
        orders[yr] = ord !== Infinity ? String(ord) : "";
      });
    }
    setFormPostAbbrs(abbrs);
    setFormPostOrders(orders);

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
    setFormPostAbbrs((prev) => ({ ...prev, [trimmed]: "" }));
    setFormPostOrders((prev) => ({ ...prev, [trimmed]: "" }));
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

      // Permanent member info — ONLY for 'team' table
      const teamPayload = {
        full_name: formName.trim(),
        department: formFiliere || "Génie Informatique",
        avatar_img: finalAvatarUrl || "/Imrane_anime.png",
        normal_img: finalNormalImageUrl || "",
        birthday: formBirthday ? formBirthday : null,
        social_media_links: socialLinks,
      };

      if (editingMember) {
        // 1. UPDATE 'team' table (permanent info)
        const { error: teamError } = await supabase
          .from("team")
          .update(teamPayload)
          .eq("id", editingMember.id);

        if (teamError) {
          showToast("Error updating profile: " + teamError.message);
          return;
        }

        // 2. UPDATE / INSERT / DELETE 'team_seasons'
        const existingSeasons = Array.isArray(editingMember.team_seasons) ? editingMember.team_seasons : [];

        for (const yr of seasons) {
          const role = formSeasonRoles[yr]?.trim() || "Team Member";
          const postAbbr = formPostAbbrs[yr]?.trim() || "";
          const postOrder =
            formPostOrders[yr] !== "" && formPostOrders[yr] !== undefined && !isNaN(Number(formPostOrders[yr]))
              ? Number(formPostOrders[yr])
              : null;

          const existingRow = existingSeasons.find((ts) => ts.season === yr);
          if (existingRow) {
            // Update existing team_seasons row
            await supabase
              .from("team_seasons")
              .update({
                role,
                post_abbr: postAbbr,
                post_order: postOrder,
              })
              .eq("id", existingRow.id);
          } else {
            // Insert new team_seasons row
            await supabase
              .from("team_seasons")
              .insert({
                team_id: editingMember.id,
                season: yr,
                role,
                post_abbr: postAbbr,
                post_order: postOrder,
              });
          }
        }

        // Delete unassigned seasons
        const unassignedSeasons = existingSeasons.filter((ts) => !seasons.includes(ts.season));
        for (const unassigned of unassignedSeasons) {
          await supabase
            .from("team_seasons")
            .delete()
            .eq("id", unassigned.id);
        }

        await loadTeamData();
        showToast("Profile record updated.");
      } else {
        // INSERT OPERATION (New Member)
        // 1. Insert into 'team'
        const { data: newTeamData, error: teamError } = await supabase
          .from("team")
          .insert([teamPayload])
          .select();

        if (teamError || !newTeamData || !newTeamData[0]) {
          showToast("Error creating member: " + (teamError?.message || "Failed to create team record"));
          return;
        }

        const newMember = newTeamData[0];

        // 2. Insert season rows into 'team_seasons'
        const seasonInserts = seasons.map((yr) => ({
          team_id: newMember.id,
          season: yr,
          role: formSeasonRoles[yr]?.trim() || "Team Member",
          post_abbr: formPostAbbrs[yr]?.trim() || "",
          post_order:
            formPostOrders[yr] !== "" && formPostOrders[yr] !== undefined && !isNaN(Number(formPostOrders[yr]))
              ? Number(formPostOrders[yr])
              : null,
        }));

        const { error: seasonError } = await supabase
          .from("team_seasons")
          .insert(seasonInserts);

        if (seasonError) {
          // Atomic rollback
          await supabase.from("team").delete().eq("id", newMember.id);
          showToast("Error saving seasons: " + seasonError.message);
          return;
        }

        await loadTeamData();
        showToast("Member profile added.");
      }

      setIsModalOpen(false);
    } catch (err) {
      showToast("Error saving profile: " + (err?.message || ""));
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
      if (deleteSeasonOnly) {
        // DELETE season assignment only
        const { error } = await supabase
          .from("team_seasons")
          .delete()
          .eq("team_id", member.id)
          .eq("season", selectedYear);

        if (error) {
          showToast("Error removing season record: " + error.message);
          return;
        }
        showToast(`Removed from season ${selectedYear}.`);
      } else {
        // DELETE member completely
        await supabase.from("team_seasons").delete().eq("team_id", member.id);
        const { error } = await supabase.from("team").delete().eq("id", member.id);
        if (error) {
          showToast("Error deleting member: " + error.message);
          return;
        }
        showToast("Member record completely removed.");
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
      await supabase.from("team_seasons").delete().eq("team_id", memberId);
      const { error } = await supabase.from("team").delete().eq("id", memberId);
      if (error) {
        showToast("Error deleting: " + error.message);
        return;
      }
      setIsProfileModalOpen(false);
      await loadTeamData();
      showToast("Member permanently deleted from database.");
    } catch (err) {
      showToast("Delete error: " + err.message);
    }
  };

  // Filtered members by year, search, and ordered by post_order
  const filteredList = members
    .filter((m) => {
      const mYears = getMemberYears(m);
      const isYear =
        mYears.includes(selectedYear) ||
        (selectedYear === "25-26" && (mYears.includes("2025-2026") || mYears.includes("2025"))) ||
        (selectedYear === "24-25" && (mYears.includes("2024-2025") || mYears.includes("2024"))) ||
        (selectedYear === "26-27" && (mYears.includes("2026-2027") || mYears.includes("2026")));

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
      {toastMsg && <div className="admin-toast-bar">{toastMsg}</div>}

      {/* Page Header */}
      <div className="admin-view-header">
        <div>
          <h1 className="admin-page-title">Staff & leadership</h1>
          <p className="admin-page-desc">
            Executive officers, mentors, and club committee engineers (table: team + team_seasons).
          </p>
        </div>

        <div className="admin-header-actions">
          <button type="button" className="btn-primary" onClick={handleOpenAdd}>
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
              return (
                mYears.includes(yr) ||
                (yr === "25-26" && (mYears.includes("2025-2026") || mYears.includes("2025"))) ||
                (yr === "24-25" && (mYears.includes("2024-2025") || mYears.includes("2024"))) ||
                (yr === "26-27" && (mYears.includes("2026-2027") || mYears.includes("2026")))
              );
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

                  <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                    {getMemberPostAbbr(m, selectedYear) && (
                      <span
                        className="member-card-order-tag"
                        style={{
                          background: "rgba(59, 130, 246, 0.12)",
                          color: "#60a5fa",
                          borderColor: "rgba(59, 130, 246, 0.3)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                        title="Post Abbreviation"
                      >
                        {getMemberPostAbbr(m, selectedYear)}
                      </span>
                    )}
                    {orderValue !== Infinity && (
                      <span className="member-card-order-tag" title="Website Display Order">
                        #{orderValue}
                      </span>
                    )}
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
                      <th>Post Abbr</th>
                      <th style={{ textAlign: "right" }}>Post order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(selectedProfileMember.team_seasons) && selectedProfileMember.team_seasons.length > 0
                      ? selectedProfileMember.team_seasons
                      : Object.entries(getMemberSeasonRoles(selectedProfileMember)).map(([yr, role]) => ({
                          season: yr,
                          role,
                          post_abbr: getMemberPostAbbr(selectedProfileMember, yr),
                          post_order: getMemberPostOrder(selectedProfileMember, yr),
                        }))
                    ).map((ts) => {
                      const order =
                        ts.post_order !== null && ts.post_order !== undefined && ts.post_order !== Infinity
                          ? `#${ts.post_order}`
                          : "Default";
                      return (
                        <tr key={ts.season}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text)" }}>
                            {ts.season}
                          </td>
                          <td>{ts.role}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>
                            {ts.post_abbr || "—"}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                            {order}
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
                {/* Full name, department & birthday */}
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr", gap: "12px" }}>
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
                    Active seasons & roles (select seasons to assign role, abbreviation, and website order)
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
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowCustomYearInput((v) => !v)}
                      style={{ padding: "5px 10px", fontSize: "12px" }}
                    >
                      + Custom season
                    </button>
                  </div>

                  {showCustomYearInput && (
                    <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                      <input
                        type="text"
                        placeholder="e.g. 26-27 or 27-28"
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

                  {/* Input table header for active seasons */}
                  <div style={{ display: "grid", gridTemplateColumns: "70px 1.4fr 1fr 90px", gap: "8px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, paddingBottom: "4px" }}>
                    <span>Season</span>
                    <span>Assigned role *</span>
                    <span>Abbreviation</span>
                    <span style={{ textAlign: "right" }}>Order #</span>
                  </div>

                  {/* Input for each active season's role, abbr, and order */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {Object.keys(formSeasonRoles).map((yr) => (
                      <div key={yr} style={{ display: "grid", gridTemplateColumns: "70px 1.4fr 1fr 90px", gap: "8px", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text)", fontWeight: 600 }}>
                          {yr}:
                        </span>
                        <input
                          type="text"
                          required
                          placeholder={`Role in ${yr} (e.g. President)`}
                          value={formSeasonRoles[yr] || ""}
                          onChange={(e) => handleRoleChangeForSeason(yr, e.target.value)}
                          className="form-text-input"
                        />
                        <input
                          type="text"
                          placeholder="e.g. PRES"
                          value={formPostAbbrs[yr] || ""}
                          onChange={(e) => setFormPostAbbrs((prev) => ({ ...prev, [yr]: e.target.value }))}
                          className="form-text-input"
                          title="Post Abbreviation (e.g. PRES, AI-LEAD)"
                        />
                        <input
                          type="number"
                          placeholder="Order #"
                          value={formPostOrders[yr] ?? ""}
                          onChange={(e) => setFormPostOrders((prev) => ({ ...prev, [yr]: e.target.value }))}
                          className="form-text-input"
                          min="1"
                          title="Website display order (1 appears first)"
                          style={{ textAlign: "right" }}
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

    </div>
  );
}
