import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test("trang chủ lên được và có tiêu đề", async ({ page }) => {
  await dangNhap(page, "pm-linh");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Đang chờ bạn");
});
