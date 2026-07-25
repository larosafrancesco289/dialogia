import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { injectThemeClass } from './src/lib/html';

const THEME_LIGHT = '#f4f1ec';
const THEME_DARK = '#16140f';

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The theme class has to land on <html> before first paint or the app flashes
 * the wrong palette. Injecting from the shared helper keeps the inline script
 * and the runtime theme logic on one source.
 */
const themeInit = () => ({
  name: 'dialogia-theme-init',
  transformIndexHtml() {
    return [{ tag: 'script', children: injectThemeClass(), injectTo: 'head' as const }];
  },
});

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    themeInit(),
    VitePWA({
      registerType: 'autoUpdate',
      // Oversized optional chunks are a deliberate skip, not a build failure.
      showMaximumFileSizeToCacheInBytesWarning: true,
      includeAssets: ['favicon.ico', 'favicon-32x32.png', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'Dialogia — Private Multi-Model Chat',
        short_name: 'Dialogia',
        description: 'Local-only, privacy-first multi-model chat UI.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: THEME_LIGHT,
        theme_color: THEME_LIGHT,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        // The app shell is precached. KaTeX's font set and the two outsized
        // mermaid chunks are left to the runtime cache: they are only needed
        // once a message actually contains math or a diagram.
        globPatterns: [
          'index.html',
          'assets/*.{js,css}',
          'assets/newsreader-*.woff2',
          'assets/plus-jakarta-sans-*.woff2',
          'icon-*.png',
        ],
        maximumFileSizeToCacheInBytes: 500 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.(?:js|css|woff2|woff|ttf)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dialogia-assets',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@/components': resolvePath('./src/components'),
      '@/lib': resolvePath('./src/lib'),
      '@/modules': resolvePath('./src/modules'),
      '@/data': resolvePath('./src/data'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 3000,
  },
});
