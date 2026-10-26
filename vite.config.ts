import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "/my-timetable/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["apple-touch-icon.png", "icon.svg"],
      manifest: {
        id: "/my-timetable/",
        name: "MyTimetable · 我的课表",
        short_name: "我的课表",
        description: "安静、简洁的大学课程表，课程仅保存在本机。",
        lang: "zh-CN",
        start_url: "/my-timetable/",
        scope: "/my-timetable/",
        display: "standalone",
        background_color: "#f7f7f2",
        theme_color: "#f7f7f2",
        icons: [
          {
            src: "/my-timetable/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/my-timetable/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/my-timetable/icon-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: [
          "**/*.{js,mjs,css,html,png,svg,ico,webmanifest,bcmap,pfb,ttf,wasm,bin,zip}",
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "/my-timetable/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
