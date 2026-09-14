import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import deleteMedia from './api/storage/delete.js'
import uploadMedia from './api/storage/upload.js'
import instagramDashboard from './api/instagram/dashboard.js'
import instagramInsights from './api/instagram/insights.js'
import instagramMedia from './api/instagram/media.js'
import instagramMediaInsights from './api/instagram/media/[id]/insights.js'
import instagramProfile from './api/instagram/profile.js'
import tikTokCallback from './api/tiktok/callback.js'
import tikTokConnect from './api/tiktok/connect.js'
import tikTokDashboard from './api/tiktok/dashboard.js'
import tikTokDisconnect from './api/tiktok/disconnect.js'
import tikTokProfile from './api/tiktok/profile.js'
import tikTokStatus from './api/tiktok/status.js'
import tikTokVideos from './api/tiktok/videos.js'

function localStorageApi() {
  return {
    name: 'local-storage-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url || '/', 'http://localhost')
        const pathname = requestUrl.pathname
        const mediaInsightsMatch = pathname.match(/^\/api\/instagram\/media\/(\d+)\/insights$/)
        const staticHandlers = {
          '/api/storage/upload': uploadMedia,
          '/api/storage/delete': deleteMedia,
          '/api/instagram/dashboard': instagramDashboard,
          '/api/instagram/profile': instagramProfile,
          '/api/instagram/insights': instagramInsights,
          '/api/instagram/media': instagramMedia,
          '/api/tiktok/callback': tikTokCallback,
          '/api/tiktok/connect': tikTokConnect,
          '/api/tiktok/dashboard': tikTokDashboard,
          '/api/tiktok/disconnect': tikTokDisconnect,
          '/api/tiktok/profile': tikTokProfile,
          '/api/tiktok/status': tikTokStatus,
          '/api/tiktok/videos': tikTokVideos,
        }
        const handler = staticHandlers[pathname] || (mediaInsightsMatch ? instagramMediaInsights : null)
        if (!handler) return next()
        request.query = Object.fromEntries(requestUrl.searchParams.entries())
        if (mediaInsightsMatch) request.query.id = mediaInsightsMatch[1]
        try {
          await handler(request, response)
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const fileEnvironment = loadEnv(mode, process.cwd(), '')
  const serverEnvironmentKeys = [
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_ENDPOINT',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'INSTAGRAM_ACCESS_TOKEN',
    'INSTAGRAM_USER_ID',
    'INSTAGRAM_APP_ID',
    'INSTAGRAM_APP_SECRET',
    'INSTAGRAM_API_VERSION',
    'SUPABASE_SERVICE_ROLE_KEY',
    'TIKTOK_CLIENT_KEY',
    'TIKTOK_CLIENT_SECRET',
    'TIKTOK_REDIRECT_URI',
    'TIKTOK_SCOPES',
  ]
  serverEnvironmentKeys.forEach((key) => {
    // During local development, prefer the current .env value so a Vite
    // config restart cannot retain stale server-only credentials or URLs.
    if (command === 'serve' && fileEnvironment[key] !== undefined) {
      process.env[key] = fileEnvironment[key]
    } else if (process.env[key] === undefined && fileEnvironment[key] !== undefined) {
      process.env[key] = fileEnvironment[key]
    }
  })

  return {
    plugins: [react(), localStorageApi()],
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor'
            }
          }
        },
      },
    },
  }
})
