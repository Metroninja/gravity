import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    watch: {
      usePolling: true,
    },
  },
  plugins: [
    tailwindcss(),
    reactRouter(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      strategies: "generateSW",
      manifest: {
        name: "Janneke van der Wouw",
        short_name: "Janneke",
        description: "Your courses, modules and videos from Janneke van der Wouw.",
        theme_color: "#B62F73",
        background_color: "#F7EDE8",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "nl",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            // Brand fonts: cache-first, long TTL
            urlPattern: /\/fonts\/.*\.(?:woff2?|ttf|otf)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "janneke-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Static logos / icons
            urlPattern: /\/(icons|brand)\/.*\.(?:png|svg|webp)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "janneke-images",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // App shell HTML: network-first, fall back to cache offline
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "janneke-pages",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 30 },
            },
          },
          {
            // Loader data: stale-while-revalidate so UI is snappy offline
            urlPattern: /\?_data=/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "janneke-loader-data" },
          },
        ],
        // Never cache media (videos/PDFs travel via signed GCS URLs).
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
      },
      devOptions: {
        // Serve manifest.webmanifest in dev too. Service worker is still
        // disabled in dev unless `type: 'module'` is also set.
        enabled: true,
        type: "module",
      },
    }),
  ],
});
