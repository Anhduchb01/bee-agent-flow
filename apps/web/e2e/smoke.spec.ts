import { test, expect } from "@playwright/test";

test("trang chủ lên được và có tiêu đề", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("bee");
});
