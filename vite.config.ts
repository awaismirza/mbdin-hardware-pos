/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
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
