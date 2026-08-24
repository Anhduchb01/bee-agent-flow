import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test("bảng dự án: issue kèm phiên đang làm nó", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/projects");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Projects");
  // Cái bảng này tồn tại vì MỘT lý do: nối issue với phiên đã làm nó.
  await expect(page.getByText("Add CSV export to the report screen")).toBeVisible();
  await expect(page.getByRole("link", { name: /bee\/myapp-41/ })).toBeVisible();
  await expect(page.getByText("no session yet").first()).toBeVisible();
});

test("lọc theo dự án và đổi sang kanban — cả hai nằm trong URL", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/projects");

  const thanhLoc = page.getByRole("navigation", { name: "Filter by project" });
  await thanhLoc.getByRole("link", { name: "blog", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\?p=blog/);
  await expect(page.getByText("Fix RSS feed encoding")).toBeVisible();
  await expect(page.getByText("Add CSV export to the report screen")).toHaveCount(0);

  await page.getByRole("link", { name: "Kanban" }).click();
  await expect(page).toHaveURL(/view=kanban/);
  // Bộ lọc dự án phải sống sót qua lần đổi view.
  await expect(page).toHaveURL(/p=blog/);
  await expect(page.getByRole("region", { name: "Backlog" })).toBeVisible();
});

test("ấn dự án ở sidebar là mở đúng bảng đã lọc", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/sessions");

  await page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "myapp" })
    .click();
  await expect(page).toHaveURL(/\/projects\?p=myapp/);
  await expect(page.getByText("Add CSV export to the report screen")).toBeVisible();
});
