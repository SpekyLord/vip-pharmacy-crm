// Phase A.5.3 + A.5.6 smoke harness. Matches frontend dev port from CLAUDE.md.
//
// `webServer` auto-starts the local dev stack so `npm run test:e2e` works
// whether or not you've already got `npm run dev` running in another terminal.
// `reuseExistingServer: true` means: if something is already listening on the
// port, Playwright will use it instead of starting a duplicate. So the typical
// dev workflow (manual dev server in a side terminal, run smoke ad-hoc) is
// unaffected — the auto-start only kicks in when nothing is up.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Two-server boot: backend first (frontend proxies/calls into it), then Vite.
  // url is what Playwright probes to decide "ready" — we use the backend health
  // endpoint and the Vite root. Cold-start budget: 60s each (backend has a
  // MongoDB Atlas handshake + index sync; Vite is fast but cold-prebundle adds
  // a few seconds the first time).
  webServer: [
    {
      command: 'npm run dev --prefix ../backend',
      url: 'http://localhost:5000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // Default smoke runs against the Vite dev bundle — fast (~7s) and
      // catches ~95% of regressions (contract/wiring). Prod-bundle smoke
      // (build + preview) is opt-in via `npm run test:e2e:prod`, which sets
      // PW_FRONTEND_MODE=preview and is gated by the env switch below.
      command: process.env.PW_FRONTEND_MODE === 'preview'
        ? 'npm run build && npx vite preview --port 5173 --strictPort'
        : 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: process.env.PW_FRONTEND_MODE === 'preview' ? 120_000 : 60_000,
      env: process.env.PW_FRONTEND_MODE === 'preview'
        ? { VITE_API_URL: 'http://localhost:5000/api' }
        : {},
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
