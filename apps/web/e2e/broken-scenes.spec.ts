import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

/**
 * Ba cảnh hỏng của `status.json`. Đổi cảnh bằng cookie — cookie chỉ có tác dụng
 * trong `lib/bee/fixture.ts`, nên không màn hình nào biết mình đang xem fixture
 * và trên máy thật nó không làm gì cả.
 */
async function setScene(page: Page, activeScene: string) {
  await page.context().addCookies([
    { name: "bee-scene", value: activeScene, url: "http://127.0.0.1:3187" },
  ]);
}

test("heartbeat cũ 35 phút → báo đỏ, và nói rõ các con số là cũ", async ({ page }) => {
  await signIn(page, "pm-linh");
  await setScene(page, "reconciler-dead");
  await page.goto("/");

  const health = page.getByRole("region", { name: "System health" });
  await expect(health).toContainText("The runner may be dead");
  await expect(health).toContainText("35 minutes");
  await expect(health).toContainText("stale");

  // Quan trọng: trang vẫn lên, hộp thư vẫn dùng được.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Overview");
});

test("thiếu status.json → báo rõ, không crash", async ({ page }) => {
  await signIn(page, "pm-linh");
  await setScene(page, "no-file");
  await page.goto("/");

  await expect(page.getByRole("region", { name: "System health" })).toContainText(
    "No data from the runner yet",
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Overview");
});

test("status.json hỏng → báo rõ, không crash", async ({ page }) => {
  await signIn(page, "pm-linh");
  await setScene(page, "bad-json");
  await page.goto("/");

  await expect(page.getByRole("region", { name: "System health" })).toContainText(
    "Cannot read system status",
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Overview");
});

test("vừa cài xong → nói bước tiếp theo, không hiện trang trống", async ({ page }) => {
  await signIn(page, "pm-linh");
  await setScene(page, "fresh-install");
  await page.goto("/");

  await expect(page.getByRole("region", { name: "System health" })).toContainText(
    "paused",
  );
});

test("có sự cố → gọi tên repo đang bị dừng", async ({ page }) => {
  await signIn(page, "pm-linh");
  await setScene(page, "something-wrong");
  await page.goto("/");

  const health = page.getByRole("region", { name: "System health" });
  await expect(health).toContainText("1 project(s) paused");
  await expect(health).toContainText(".agent/PAUSE");
});
