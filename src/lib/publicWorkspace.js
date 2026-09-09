import { eventView, safeEventUrl } from "./adminEvents";
import { readClubSettings, shortSeason } from "./clubSettings";
import { withRequestTimeout } from "./requestTimeout";

const STATIC_SITE_IMAGES = [
  "/Bg-swip.png",
  "/imrane-anime.png",
  "/events/competition.png",
  "/events/drone.png",
  "/events/expo.png",
  "/events/hackathon.png",
  "/events/summit.png",
  "/events/workshop.png",
  "/partners/a4cLight.png",
  "/partners/estsLight.png",
  "/partners/GPS.png",
  "/partners/OCP.png",
  "/partners/Renault.png",
  "/partners/ucaLight.png",
  "/RAI/club sign.png",
  "/RAI/club-icon-light.png",
  "/RAI/RAI FRONT.png",
  "/RAI/RAI MOBILE NORMAL 1080.jpg",
  "/RAI/RAI MOBILE X-RAY 1080.jpg",
  "/RAI/RAI-ORI.png",
  "/RAI/RAI-RS.png",
  "/RAI/RAI-XRAY.png",
  "/RAI/RIA-LS.png",
  "/why-join/why_join_gold.jpg",
  "/why-join/why_join_main.jpg",
  "/why-join/why_join_tee_black.jpg",
  "/why-join/why_join_tee_white.jpg",
  "/album/1.jpg",
  "/album/2.JPG",
  "/album/3.jpg",
  "/album/4.jpg",
  "/album/5.jpg",
  "/album/6.jpg",
  "/album/7.jpg",
];

function loadImage(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const cache = window.__raiImageCache || (window.__raiImageCache = new Map());
    const cached = cache.get(url);
    if (cached?.complete && cached.naturalWidth > 0) {
      Promise.resolve(cached.decode?.()).catch(() => {}).finally(resolve);
      return;
    }

    const image = new Image();
    let settled = false;
    const finish = async (shouldCache = false) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (shouldCache && image.naturalWidth > 0) {
        try {
          await image.decode?.();
        } catch {
          // A completed image remains usable even if explicit decoding is unavailable.
        }
        cache.set(url, image);
      }
      resolve();
    };
    const timeout = window.setTimeout(() => finish(false), timeoutMs);
    image.decoding = "async";
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
    if (image.complete) finish(image.naturalWidth > 0);
  });
}

async function loadEvents(client, fallbackClient) {
  let result = await withRequestTimeout(
    client.from("events").select("*").order("id", { ascending: false }),
    "Public events",
    7000,
  ).catch((error) => ({ data: null, error }));

  if ((result.error || !result.data) && fallbackClient && fallbackClient !== client) {
    result = await withRequestTimeout(
      fallbackClient.from("events").select("*").order("id", { ascending: false }),
      "Public events fallback",
      7000,
    ).catch((error) => ({ data: null, error }));
  }

  return Array.isArray(result.data) ? result.data : [];
}

async function loadTeam(client, fallbackClient) {
  const relationalSelect = `
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
  `;

  let result = await withRequestTimeout(
    client.from("team").select(relationalSelect).order("id", { ascending: false }),
    "Public team",
    7000,
  ).catch((error) => ({ data: null, error }));

  if ((result.error || !result.data) && fallbackClient && fallbackClient !== client) {
    result = await withRequestTimeout(
      fallbackClient.from("team").select("*, team_seasons(*)").order("id", { ascending: false }),
      "Public team fallback",
      7000,
    ).catch((error) => ({ data: null, error }));
  }

  if (result.error || !result.data) {
    result = await withRequestTimeout(
      client.from("team").select("*").order("id", { ascending: false }),
      "Public team records",
      7000,
    ).catch((error) => ({ data: null, error }));
  }

  return Array.isArray(result.data) ? result.data : [];
}

async function loadSettings(client) {
  try {
    return await withRequestTimeout(readClubSettings(client), "Club settings", 5000);
  } catch {
    return null;
  }
}

async function warmImageCache(dataset, onProgress) {
  const urls = new Set(STATIC_SITE_IMAGES);

  dataset.team.forEach((member) => {
    [member.avatar_img, member.normal_img, member.image, member.image_url].forEach((url) => {
      if (typeof url === "string" && url.trim()) urls.add(url.trim());
    });
  });

  dataset.events.forEach((row) => {
    const url = safeEventUrl(eventView(row).image_url, true);
    if (url) urls.add(url);
  });

  const list = [...urls];
  let complete = 0;
  await Promise.all(list.map(async (url) => {
    await loadImage(url);
    complete += 1;
    onProgress?.({
      progress: 55 + Math.round((complete / list.length) * 43),
      stage: `Preparing visual assets ${complete}/${list.length}`,
    });
  }));
}

export async function loadPublicWebsite(client, fallbackClient, onProgress = () => {}) {
  onProgress({ progress: 6, stage: "Connecting to the club database" });
  let completedRequests = 0;
  const tracked = (promise) => promise.finally(() => {
    completedRequests += 1;
    onProgress({
      progress: 12 + completedRequests * 13,
      stage: completedRequests < 3 ? "Loading club records" : "Club records received",
    });
  });

  const [team, events, settings] = await Promise.all([
    tracked(loadTeam(client, fallbackClient)),
    tracked(loadEvents(client, fallbackClient)),
    tracked(loadSettings(client)),
  ]);

  const dataset = {
    team,
    events,
    settings,
    season: shortSeason(settings?.public_staff_season) || "25-26",
  };

  onProgress({ progress: 55, stage: "Preparing images" });
  const fontsReady = document.fonts?.ready || Promise.resolve();
  await Promise.all([warmImageCache(dataset, onProgress), fontsReady]);
  onProgress({ progress: 100, stage: "Ready" });
  return dataset;
}
