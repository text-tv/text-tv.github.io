import { execSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/*
 * Which build is running, for the `?diag` readout. Temporary, with the rest of
 * that scaffolding: a phone serves the app off a service worker cache, so
 * "does the device have my change yet" is otherwise unanswerable from a
 * screenshot. Falls back to a dash where git is not available.
 */
const build = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return '-'
  }
})()

export default defineConfig({
  define: { __BUILD__: JSON.stringify(build) },
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
        // The face has to be precached with the rest of the shell: without it
        // an offline page falls back to a monospace of a different advance and
        // every row drifts out of its columns.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
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
