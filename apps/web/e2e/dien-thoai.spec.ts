import { devices, expect, test } from "@playwright/test";

import { vaoViec } from "./helpers";

// Tiêu chí nghiệm thu V1: "Mở trên điện thoại: đọc được hộp thư và bấm được
// Duyệt." Hai người dùng của app này duyệt PR trên đường đi, không phải ở bàn.
// Pixel 7 chứ không phải iPhone: bộ này chỉ cài Chromium, và một device
// WebKit sẽ làm cả suite đỏ trên máy chưa `playwright install webkit`.
test.use({ ...devices["Pixel 7"] });

test("trên điện thoại: đọc được hộp thư, không tràn ngang", async ({ page }) => {
  await vaoViec(page, "pm-linh");

  // Sức khoẻ hệ thống giờ sống ở Tổng quan và ở chân sidebar, không ở đây.
  await expect(page.getByRole("group", { name: "Việc đang chờ bạn" })).toBeVisible();

  const tran = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(tran).toBe(false);
});

test("trên điện thoại: bấm được Duyệt", async ({ page }) => {
  await vaoViec(page, "pm-linh");
  await page.goto("/t/shop/30");

  const nut = page.getByRole("button", { name: "Duyệt PR" });
  await expect(nut).toBeVisible();

  // Vùng bấm đủ lớn cho ngón tay — nút nhỏ hơn ~32px là nút bấm trượt.
  const hop = await nut.boundingBox();
  expect(hop!.height).toBeGreaterThanOrEqual(28);

  await nut.click();
  await expect(page.getByText("Đã duyệt — merge trên GitHub")).toBeVisible();
});
