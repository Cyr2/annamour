import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const NIGHT = "#12101A";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
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
        theme_color: NIGHT,
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Only pre-cache the Latin font subsets; browsers fetch the others on demand.
        globIgnores: ["**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2"],
        // The API, the socket and the video stream must always hit the network.
        navigateFallbackDenylist: [/^\/api/, /^\/ws/, /^\/media/],
      },
    }),
  ],
  build: {
    // hls.js (~580 kB) is its own lazy chunk, loaded only on the watch screen.
    chunkSizeWarningLimit: 700,
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
