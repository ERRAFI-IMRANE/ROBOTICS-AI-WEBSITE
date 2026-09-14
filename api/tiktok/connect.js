import { tikTokService } from "../../server/tiktok.js";
import { createOAuthState, handleTikTokAdmin, oauthStateCookie } from "../../server/tiktokHttp.js";

export default function handler(request, response) {
  return handleTikTokAdmin(request, response, {
    methods: ["POST"],
    loader: async () => {
      const state = createOAuthState();
      response.setHeader("Set-Cookie", oauthStateCookie(state));
      return { authorizationUrl: tikTokService.connectUrl(state) };
    },
  });
}
