import { instagramService } from "../../../../server/instagram.js";
import { handleInstagramGet } from "../../../../server/instagramHandler.js";

export default function handler(request, response) {
  return handleInstagramGet(request, response, async () => (await instagramService.mediaInsights(request.query?.id)).value);
}
