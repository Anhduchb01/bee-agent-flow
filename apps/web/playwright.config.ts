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
    // KHÔNG dùng lại server đang chạy. Một server mồ côi từ lượt trước vẫn trả
    // HTML mới nhưng phục vụ chunk của bản build cũ, nên trang lên bình thường
    // mà không hydrate: mọi nút im lặng không làm gì. Chín bài test đỏ cùng lúc
    // và không bài nào chỉ đúng nguyên nhân. Thà hỏng ồn ào vì cổng bận còn hơn
    // âm thầm kiểm một bản build khác với bản vừa sửa.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
