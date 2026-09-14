import { instagramService, normalizeRange } from "../../server/instagram.js";
import { handleInstagramGet } from "../../server/instagramHandler.js";

export default function handler(request, response) {
  const force = request.query?.refresh === "1";
  return handleInstagramGet(request, response, () => instagramService.dashboard(normalizeRange(request.query?.range), { force }));
}
