const searchableText = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function searchAdminSections(items, query) {
  const terms = searchableText(query).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const text = searchableText(`${item.label} ${item.caption} ${item.id.replaceAll("_", " ")}`);
    return terms.every((term) => text.includes(term));
  });
}

// Derive activity from the shared, confirmed workspace; no second applicant store or query.
export function latestAdminNotifications(workspace, allowedSections, limit = 8) {
  const activity = [];
  const add = (section, id, title, detail, date) => {
    if (!date) return;
    const timestamp = Date.parse(date);
    if (!Number.isFinite(timestamp)) return;
    activity.push({ section, id, title, detail, timestamp, date: new Date(timestamp).toISOString() });
  };

  if (allowedSections.includes("registrations")) {
    (workspace?.registrations ?? []).forEach((row) => {
      add("registrations", `application-${row.id}`, "New application", row.full_name || "Club applicant", row.created_at);
      if (row.interview_completed === true) {
        add("registrations", `interview-${row.id}`, "Interview completed", row.full_name || "Club applicant", row.interviewed_at);
      }
    });
  }
  if (allowedSections.includes("events")) {
    (workspace?.events ?? []).forEach((row) => {
      add("events", `event-${row.id}`, "Event added", row.title || "Club event", row.created_at);
    });
  }
  return activity.sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id)).slice(0, Math.max(0, limit));
}
