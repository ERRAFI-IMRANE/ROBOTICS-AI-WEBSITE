import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import deleteMedia from './api/storage/delete.js'
import uploadMedia from './api/storage/upload.js'

function localStorageApi() {
  return {
    name: 'local-storage-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname
        const handler = pathname === '/api/storage/upload'
          ? uploadMedia
          : pathname === '/api/storage/delete'
            ? deleteMedia
            : null
        if (!handler) return next()
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
export default defineConfig(({ mode }) => {
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
  ]
  serverEnvironmentKeys.forEach((key) => {
    if (process.env[key] === undefined && fileEnvironment[key] !== undefined) {
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
