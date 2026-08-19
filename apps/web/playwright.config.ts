import { defineConfig, devices } from "@playwright/test";

// The e2e port must not collide with a dev server someone left running on
// 3187 — override with E2E_PORT instead of killing their process.
const PORT = process.env.E2E_PORT ?? "3187";

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
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Chạy ĐÚNG artifact mà install.sh cài, không phải `next start`.
    //
    // `next start` với `output: standalone` in ra cảnh báo "does not work" rồi
    // vẫn chạy — nghĩa là cả bộ e2e kiểm một server khác với server thật, và
    // khác ở đúng chỗ dễ sai nhất: bản standalone không tự mang `.next/static`,
    // nên thiếu bước copy là trang lên mà không có CSS lẫn JS. Đó là thứ phải
    // đỏ ở đây, không phải sau khi đã cài lên máy.
    // `pnpm build` tự copy .next/static + public vào standalone — bài học
    // 19/08: một bản build "gates" không copy đã đẩy web service lên mạng
    // không CSS. Copy nằm trong build, không nằm trong trí nhớ của ai cả.
    command:
      `pnpm build && PORT=${PORT} HOSTNAME=127.0.0.1 node .next/standalone/apps/web/server.js`,
    url: `http://127.0.0.1:${PORT}`,
    // KHÔNG dùng lại server đang chạy. Một server mồ côi từ lượt trước vẫn trả
    // HTML mới nhưng phục vụ chunk của bản build cũ, nên trang lên bình thường
    // mà không hydrate: mọi nút im lặng không làm gì. Chín bài test đỏ cùng lúc
    // và không bài nào chỉ đúng nguyên nhân. Thà hỏng ồn ào vì cổng bận còn hơn
    // âm thầm kiểm một bản build khác với bản vừa sửa.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
