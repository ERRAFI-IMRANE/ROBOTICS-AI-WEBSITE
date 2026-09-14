import { tikTokService } from "../../server/tiktok.js";
import { handleTikTokAdmin } from "../../server/tiktokHttp.js";

export default function handler(request, response) {
  return handleTikTokAdmin(request, response, { loader: () => tikTokService.status() });
}
