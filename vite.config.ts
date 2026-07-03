import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Apex Warfare — Vite config.
// Note: @babylonjs/havok ships a .wasm; `optimizeDeps.exclude` keeps Vite from trying to
// pre-bundle it, and we let it be served as an asset. The PWA precaches it for offline.
export default defineConfig({
  base: "./",
  build: {
    target: "es2021",
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
  },
  server: {
    host: true,
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      workbox: {
        // Precache the app shell + the Havok wasm so the game runs fully offline.
        globPatterns: ["**/*.{js,css,html,svg,png,glb,ktx2,env,wasm,mp3,ogg}"],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
      manifest: {
        name: "Apex Warfare",
        short_name: "ApexWar",
        description: "Single-player 3D vehicle combat: helis, tanks, jets and boats battle across open warzones.",
        theme_color: "#0a0e14",
        background_color: "#0a0e14",
        display: "fullscreen",
        orientation: "landscape",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
