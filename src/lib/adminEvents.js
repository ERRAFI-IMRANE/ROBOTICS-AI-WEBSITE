const MONTH_LOOKUP = Object.freeze({
  jan: 0, january: 0, janvier: 0,
  feb: 1, february: 1, fevrier: 1, "février": 1,
  mar: 2, march: 2, mars: 2,
  apr: 3, april: 3, avril: 3, avr: 3,
  may: 4, mai: 4,
  jun: 5, june: 5, juin: 5,
  jul: 6, july: 6, juillet: 6, juil: 6,
  aug: 7, august: 7, aout: 7, "août": 7,
  sep: 8, sept: 8, september: 8, septembre: 8,
  oct: 9, october: 9, octobre: 9,
  nov: 10, november: 10, novembre: 10,
  dec: 11, december: 11, decembre: 11, "décembre": 11,
});

function validUtcDate(year, month, day) {
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}

export function safeEventUrl(value, image = false) {
  if (!value || typeof value !== "string") return "";
  const url = value.trim();
  if (image && url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? url : "";
  } catch {
    return "";
  }
}

export function formatDateForDatabase(value) {
  const input = String(value || "").trim();
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Choose a valid event date.");
  const [, year, month, day] = match;
  if (!validUtcDate(Number(year), Number(month) - 1, Number(day))) throw new Error("Choose a valid event date.");
  return `${day}/${month}/${year}`;
}

export function formatDateForInput(value) {
  const input = String(value || "").trim();
  const stored = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (stored) {
    const [, day, month, year] = stored;
    return validUtcDate(Number(year), Number(month) - 1, Number(day)) ? `${year}-${month}-${day}` : "";
  }
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return "";
  return validUtcDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) ? input : "";
}

export function parseEventDate(value) {
  const row = value && typeof value === "object" && !(value instanceof Date) ? value : null;
  const raw = String(row ? row.date || "" : value || "").trim();
  if (!raw) return null;

  const stored = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (stored) return validUtcDate(Number(stored[3]), Number(stored[2]) - 1, Number(stored[1]));
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (iso) return validUtcDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  // Legacy ranges such as "13-14 Oct 2024" remain displayable and sortable by their first day.
  const year = Number(raw.match(/\b(19|20)\d{2}\b/)?.[0]);
  const day = Number(raw.match(/\b\d{1,2}\b/)?.[0] || 1);
  const monthWord = raw.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿñæœ]+/g)?.find((word) => MONTH_LOOKUP[word] !== undefined);
  if (year && monthWord) return validUtcDate(year, MONTH_LOOKUP[monthWord], day);
  return null;
}

export function eventView(row = {}) {
  return {
    id: row.id,
    title: String(row.title ?? ""),
    date: String(row.date ?? ""),
    image_url: typeof row.image_url === "string" ? row.image_url : "",
    link: typeof row.link === "string" ? row.link : "",
    created_at: row.created_at ?? null,
  };
}

export function eventPayload(values) {
  const title = String(values?.title || "").trim();
  const imageUrl = String(values?.image_url || "").trim();
  const link = String(values?.link || "").trim();
  if (!title) throw new Error("Enter an event title.");
  const date = formatDateForDatabase(values?.date);
  if (!safeEventUrl(imageUrl, true)) throw new Error("Choose a valid event image.");
  if (link && !safeEventUrl(link)) throw new Error("The event link must be a valid http or https URL.");
  return { title, date, image_url: imageUrl, link };
}

export async function saveEvent(client, values, existing) {
  const payload = eventPayload(values);
  const query = existing
    ? client.from("events").update(payload).eq("id", existing.id)
    : client.from("events").insert(payload);
  const { data, error } = await query.select("id,title,date,image_url,link,created_at").single();
  if (error || !data?.id) throw new Error(error?.message || "Save was not confirmed. Refresh before retrying.");
  return data;
}

export async function deleteEvent(client, id) {
  const { data, error } = await client.from("events").delete().eq("id", id).select("id").single();
  if (error || String(data?.id) !== String(id)) throw new Error(error?.message || "Deletion was not confirmed.");
}
