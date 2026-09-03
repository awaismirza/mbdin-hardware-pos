import { defineConfig, devices } from '@playwright/test';

/**
 * One browser, one project. The shop has one device and the point of the
 * end-to-end pass is to walk a real day through a real build, not to chase
 * cross-browser matrices.
 *
 * Tests run against `vite preview` of a production build, because the service
 * worker, the precache and the OPFS path only exist there.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI'] ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions: {
      // Chromium's OPFS needs no flags; these only keep headless quieter.
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      // Sandboxes and CI images that ship their own Chromium can point at it
      // rather than downloading a second copy.
      ...(process.env['PLAYWRIGHT_CHROMIUM_PATH']
        ? { executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] }
        : {}),
    },
  },
  projects: [
    {
      name: 'tablet-landscape',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    stdout: 'pipe',
    stderr: 'pipe',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
