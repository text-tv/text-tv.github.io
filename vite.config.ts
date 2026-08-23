import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative, so the build runs unchanged at a GitHub Pages project path
  // (/text-tv/) or at a domain root. Hash routing means no path ever needs
  // resolving server-side.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is hand-written in src/serviceWorker.ts: the generated
      // script only registers, which leaves an installed copy on its cached
      // shell forever.
      injectRegister: null,
      includeAssets: ['apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'Text-TV',
        short_name: 'Text-TV',
        description: 'SVT Text med länkar som fungerar på pekskärm.',
        lang: 'sv',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        // Black everywhere, so there is no white flash on launch and no
        // bright border around the frame.
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The shell only. Page content freshness is owned by the app's own
        // store; a second cache would give a second answer about staleness.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
