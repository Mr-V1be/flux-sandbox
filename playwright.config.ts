import { defineConfig } from '@playwright/test';

/**
 * End-to-end config. `webServer` builds and serves the production bundle
 * on port 4173 for every test run so we always exercise the same code path
 * that's deployed to GitHub Pages.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  reporter: [['list']],
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    headless: true,
    viewport: { width: 1280, height: 820 },
  },
  // Vite dev server uses base '/' (production build uses /flux-sandbox/).
  // We point Playwright at the dev server so tests don't pay the build cost.
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
