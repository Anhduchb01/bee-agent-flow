import { defineConfig, devices } from "@playwright/test";

// webServer tự khởi động dev server — Playwright chỉ là tiến trình thường, không
// cần Docker. Đây cũng là cách agent chạy nó dưới bee-agent (xem AGENTS.md §2).
export default defineConfig({
  testDir: "./e2e",
  // Một tiến trình server, một store fixture trong bộ nhớ. Chạy song song thì
  // bài test ghi comment vào #49 làm hỏng bài test đếm dòng thời gian của #49 —
  // và thất bại đó nói về cách chạy test, không nói gì về sản phẩm. Cả bộ chạy
  // trong ~15 giây nên chạy tuần tự không phải cái giá đáng cân nhắc.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:3187",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm exec next start --port 3187",
    url: "http://127.0.0.1:3187",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
