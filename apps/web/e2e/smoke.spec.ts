import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test("trang chủ là Tổng quan, điều hướng nằm ở sidebar", async ({ page }) => {
  await dangNhap(page, "pm-linh");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tổng quan");

  const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
  await expect(nav.getByRole("link", { name: "Tổng quan" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Việc của bạn" })).toBeVisible();
  // Dự án nằm ngay trong sidebar: đổi dự án còn một cú bấm.
  await expect(nav.getByRole("link", { name: "myapp" })).toBeVisible();
});
