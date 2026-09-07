export function eventData(row) {
  if (typeof row?.data === "string") { try { return JSON.parse(row.data) || {}; } catch { return {}; } }
  return row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
}
export function safeEventUrl(value, image = false) {
  if (!value || typeof value !== "string") return "";
  const url = value.trim();
  if (image && url.startsWith("/") && !url.startsWith("//")) return url;
  try { const parsed = new URL(url); return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? url : ""; } catch { return ""; }
}
function linkValue(value) {
  if (Array.isArray(value)) return linkValue(value[0]);
  if (value && typeof value === "object") return linkValue(value.url || value.link || value.href);
  return typeof value === "string" ? value : "";
}
export function eventView(row) {
  const data = eventData(row);
  return {
    title: String(data.title ?? row.title ?? data.name ?? row.name ?? ""),
    date: String(data.date ?? row.date ?? row.event_date ?? ""),
    image_url: row.image_url ?? data.image_url ?? data.image ?? row.image ?? "/events/workshop.png",
    link: linkValue(row.links ?? data.links ?? data.link ?? row.link ?? data.url ?? row.url),
    description: String(data.description ?? row.description ?? ""),
    // Existing unclassified records are completed, as confirmed by the club.
    status: data.status || row.status || "Completed",
  };
}
export function eventPayload(values, existing, template) {
  const title = values.title.trim();
  if (!title) throw new Error("Enter an event title.");
  if (!values.date.trim()) throw new Error("Enter an event date.");
  if (values.link.trim() && !safeEventUrl(values.link)) throw new Error("The event link must be a valid http or https URL.");
  if (!safeEventUrl(values.image_url, true)) throw new Error("Choose an image or enter a valid image URL.");
  if (!["Completed", "Upcoming"].includes(values.status)) throw new Error("Choose an event status.");
  const fields = { title, date: values.date.trim(), image_url: values.image_url.trim(), image: values.image_url.trim(), link: values.link.trim(), status: values.status, description: values.description.trim() };
  const shape = existing || template || { data: {} };
  const payload = {};
  if (Object.hasOwn(shape, "data")) {
    payload.data = { ...eventData(existing), ...fields };
    if (Object.hasOwn(eventData(existing), "links")) payload.data.links = fields.link;
  }
  // Write only columns exposed by the loaded rows; preserve unrelated JSON metadata.
  for (const [key, value] of Object.entries(fields)) if (Object.hasOwn(shape, key)) payload[key] = value;
  if (Object.hasOwn(shape, "links")) payload.links = fields.link;
  if (Object.hasOwn(shape, "event_date")) payload.event_date = fields.date;
  if (!Object.keys(payload).length) throw new Error("Unsupported event schema. Reload events before saving.");
  return payload;
}
export async function saveEvent(client, values, existing, template) {
  const payload = eventPayload(values, existing, template);
  const query = existing ? client.from("events").update(payload).eq("id", existing.id) : client.from("events").insert(payload);
  const { data, error } = await query.select().single();
  if (error || !data?.id) throw new Error(error?.message || "Save was not confirmed. Refresh before retrying.");
  return data;
}
export async function deleteEvent(client, id) {
  const { data, error } = await client.from("events").delete().eq("id", id).select("id").single();
  if (error || String(data?.id) !== String(id)) throw new Error(error?.message || "Deletion was not confirmed.");
}
