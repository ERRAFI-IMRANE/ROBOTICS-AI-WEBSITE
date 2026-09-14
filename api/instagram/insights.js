import { instagramService, normalizeRange } from "../../server/instagram.js";
import { handleInstagramGet } from "../../server/instagramHandler.js";

export default function handler(request, response) {
  return handleInstagramGet(request, response, async () => (await instagramService.accountInsights(normalizeRange(request.query?.range))).value);
}
