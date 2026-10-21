import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

// https://vite.dev/config/
const apiPort = process.env.API_PORT || 3000;

// https://vite.dev/config/
export default defineConfig({
  // SPA deep links must resolve assets from the server root on reload.
  base: '/',
  plugins: [inspectAttr(), react()],
  server: {
    // API (Hono, dev:api) owns :3000 by default (override with API_PORT if
    // taken); vite dev runs on :5173 and proxies REST + WebSocket so the
    // frontend's relative /api and /ws URLs work.
    host: '127.0.0.1',
    port: Number(process.env.CANVAS_UI_PORT || 5173),
    strictPort: true,
    proxy: {
      "/native": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true },
      "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true },
      "/ws": { target: `ws://127.0.0.1:${apiPort}`, changeOrigin: true, ws: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
