import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

// https://vite.dev/config/
const apiPort = process.env.API_PORT || 3000;

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    // API (Hono, dev:api) owns :3000 by default (override with API_PORT if
    // taken); vite dev runs on :5173 and proxies REST + WebSocket so the
    // frontend's relative /api and /ws URLs work.
    port: 5173,
    proxy: {
      "/api": `http://localhost:${apiPort}`,
      "/ws": { target: `ws://localhost:${apiPort}`, ws: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
