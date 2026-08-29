/**
 * vite.config.ts
 *
 * WHAT THIS IS. The build for src/web, the React 19 single page app.
 *
 * WHY IT EXISTS. One process serves everything. Fastify serves the built assets out of
 * dist/web on the same port as the API, so there is one deployment, one domain and no CORS.
 * Splitting the front end from the back end buys nothing at 130 users and costs a second
 * deployment to keep in step.
 *
 * WHY THE PROXY. In development the API runs on its own port under tsx watch. Without the
 * proxy the browser would have to know two origins, and the SSE stream in particular would
 * then be a cross origin request, which is a different code path from the one that ships.
 * Developing against the shipping path is worth the six lines.
 *
 * WHAT CALLS IT. `npm run build:web` and `npm run dev:web`.
 * WHAT IT WRITES. dist/web.
 *
 * WHAT THE SERVER HAS TO DO WITH THE OUTPUT, and it is one line. The app routes on the
 * hash, so every address a founder can reach is `/#/...` and the server only ever has to
 * answer `/` with index.html and serve `dist/web` as static files. There is no catch all to
 * write and no unknown path to map back to the app. That was chosen deliberately: a catch
 * all sitting next to a static file handler is easy to get subtly wrong, and when it is
 * wrong the symptom is a founder pasting a link and reading "Not Found" on the morning of
 * the event.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_PORT = process.env["PORT"] ?? "5000";

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    // Founders are on venue wifi with 130 other people. Small and few beats clever.
    sourcemap: false,
  },
  server: {
    proxy: {
      "/api": { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true },
      // The SSE stream must not be buffered by the dev proxy, or streaming looks broken in
      // development and fine in production, which is the worst way round.
      "/auth": { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true },
    },
  },
});
