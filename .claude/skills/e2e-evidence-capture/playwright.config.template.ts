/**
 * Playwright config tuned for evidence capture.
 * Copy to `frontend/playwright.config.ts` and adjust baseURL / webServer.
 *
 * See SKILL.md in this directory for the rules around what may be published.
 */
import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

// The evidence run is deliberately stricter than the everyday run: no retries
// (retries hide flake) and a single worker (parallel workers interleave server
// logs, which makes a failure impossible to correlate with a video).
const IS_EVIDENCE_RUN = process.env.E2E_EVIDENCE === '1'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',

  fullyParallel: !IS_EVIDENCE_RUN,
  workers: IS_EVIDENCE_RUN ? 1 : undefined,
  retries: 0,
  forbidOnly: !!process.env.CI,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/html', open: 'never' }],
    // publish-evidence.sh reads this to map each spec to its pass/fail result.
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    baseURL: BASE_URL,

    // Always on. `retain-on-failure` would give footage only for runs whose
    // footage must never be published.
    video: { mode: 'on', size: { width: 1280, height: 720 } },

    // Traces are large and only useful while debugging a red run.
    trace: 'retain-on-failure',

    // Named before/after shots are taken explicitly inside tests instead.
    screenshot: 'only-on-failure',

    // Freeze anything that would otherwise differ between two recordings of
    // the same flow. Locale and timezone affect rendered dates.
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',

    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      // Run this project only for ACs that mention responsive behavior:
      //   npx playwright test --project=mobile e2e/ac-3-*.spec.ts
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],

  // Reuse an already-running dev server locally; always start a fresh one in
  // CI so the recording can never be of a stale build.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
