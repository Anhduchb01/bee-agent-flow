import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test("danh sách dự án có dải thống kê", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  // Sidebar + now registers repos on /setup; the legacy listing is reached
  // directly, like them-du-an.spec does.
  await page.goto("/projects");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Projects");
  await expect(page.getByText("Agents working").first()).toBeVisible();
  await expect(page.getByText("Open PRs").first()).toBeVisible();
});

test.describe("chi tiết dự án", () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, "pm-linh");
    await page.goto("/p/myapp");
  });

  test("bảng liệt kê task đang mở", async ({ page }) => {
    const bang = page.getByRole("list", { name: "Project tasks" });
    await expect(bang).toBeVisible();
    await expect(bang).toContainText("Filter orders by status");
  });

  test("ấn vào task mở được trang chi tiết", async ({ page }) => {
    await page.getByRole("link", { name: "Filter orders by status" }).click();

    await expect(page).toHaveURL(/\/t\/myapp\/40/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Filter orders by status",
    );
  });
});
