import { eventView, safeEventUrl } from "./adminEvents";
import { readRegistrationSettings } from "./registration";
import { withRequestTimeout } from "./requestTimeout";

async function loadTeam(publicClient) {
  let result = await withRequestTimeout(
    publicClient
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
      .order("id", { ascending: false }),
    "Loading staff",
  );

  if (result.error || !result.data) {
    result = await withRequestTimeout(publicClient.from("team").select("*").order("id", { ascending: false }), "Loading staff");
  }
  if (result.error) throw result.error;
  return result.data || [];
}

async function readRows(request, label) {
  const result = await withRequestTimeout(request, label);
  if (result.error) throw result.error;
  return result.data || [];
}

export async function loadAdminWorkspace(client, publicClient, onStage = () => {}, permissions = null) {
  onStage("Connecting to the club database");
  const canReviewRegistrations = !Array.isArray(permissions) || permissions.includes("registrations");
  const [team, events, registrations, settings] = await Promise.all([
    loadTeam(publicClient),
    readRows(publicClient.from("events").select("id,title,date,image_url,link,created_at").order("id", { ascending: false }), "Loading events"),
    canReviewRegistrations
      ? readRows(client.from("registrations").select("*").order("created_at", { ascending: false }), "Loading registrations")
      : Promise.resolve([]),
    readRegistrationSettings(client),
  ]);

  return { team, events, registrations, settings };
}

function preloadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = url;
    if (image.complete) resolve();
  });
}

export async function warmAdminImageCache(dataset, timeoutMs = 3500) {
  const urls = new Set();
  dataset.team.forEach((member) => {
    [member.avatar_img, member.normal_img].forEach((url) => {
      if (typeof url === "string" && url.trim()) urls.add(url.trim());
    });
  });
  dataset.events.forEach((row) => {
    const url = safeEventUrl(eventView(row).image_url, true);
    if (url) urls.add(url);
  });
  if (!urls.size) return;

  let timeout;
  try {
    await Promise.race([
      Promise.allSettled([...urls].map(preloadImage)),
      new Promise((resolve) => { timeout = window.setTimeout(resolve, timeoutMs); }),
    ]);
  } finally {
    window.clearTimeout(timeout);
  }
}
