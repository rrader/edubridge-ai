import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/edubridge-ai/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [],
      manifest: {
        name: "EduBridge AI — навчання дробів",
        short_name: "EduBridge",
        description: "Офлайн-курс математики для 6 класу",
        lang: "uk",
        theme_color: "#f7f7f4",
        background_color: "#f7f7f4",
        display: "standalone",
        start_url: "/edubridge-ai/",
        scope: "/edubridge-ai/",
        icons: [
          {
            src: "pwa.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,webmanifest,png,json}"],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
