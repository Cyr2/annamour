import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const NIGHT = "#12101A";
/** The top of the starry sky (tokens.css --am-sky-top): the status bar blends into it. */
const SKY_TOP = "#0D1122";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt": the app chooses when to switch to a new version (never in the middle of a film, see lib/app-update.ts).
      registerType: "prompt",
      includeAssets: ["icon.svg", "apple-touch-icon-v2.png"],
      manifest: {
        name: "Annamour",
        short_name: "Annamour",
        description: "Une soirée ensemble",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: NIGHT,
        theme_color: SKY_TOP,
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The API, the socket and the video stream must always hit the network.
        navigateFallbackDenylist: [/^\/api/, /^\/ws/, /^\/media/],
      },
    }),
  ],
  build: {
    // hls.js (~580 kB) is its own lazy chunk, loaded only in a séance; the app's own chunks stay well under this.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // What the first screen needs ships as one file, not ~30 small shared chunks: each costs a
          // round trip on a phone's network, and it was most of the time before the first paint.
          groups: [{ name: "app", tags: ["$initial"] }],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
  preview: {
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
});
