/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  /*
   * Root by default, so `npm run dev`, `npm run preview` and the whole test
   * suite behave as they always have.
   *
   * A GitHub Pages *project* site is served from /<repo>/, not from the domain
   * root, so the deploy workflow sets VITE_BASE to that subpath. Vite then
   * rewrites the asset URLs in index.html and the font url() calls in the CSS
   * on its own; what it cannot rewrite is public/manifest.webmanifest (copied
   * verbatim) — which is why every path in that file is relative — and any
   * absolute path written by hand in code, which is why the router takes a
   * basename and hard navigations go through import.meta.env.BASE_URL.
   */
  base: process.env['VITE_BASE'] ?? '/',

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // The version comes from package.json (imported in src/version.ts); the build
  // time is stamped here so the Settings "About" card can show when the running
  // bundle was produced.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },

  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: null,
      manifest: false, // hand-written at public/manifest.webmanifest
      injectManifest: {
        // The SQLite wasm binary is ~1.5 MB and must be precached: the app is
        // useless offline without it.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,wasm,woff2,svg,png,ico,webmanifest}'],
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],

  // sqlite-wasm must not be pre-bundled: esbuild rewrites the `import.meta.url`
  // it uses to locate sqlite3.wasm and the module then fails to instantiate.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },

  worker: { format: 'es' },

  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@zxing')) return 'zxing';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },

  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['tests/e2e/**'],
  },
});
