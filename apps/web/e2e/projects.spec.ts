import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("bảng dự án: issue kèm phiên đang làm nó", async ({ page }) => {
  await signIn(page, "pm-linh");
  await page.goto("/projects");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Projects");
  // Cái bảng này tồn tại vì MỘT lý do: nối issue với phiên đã làm nó.
  await expect(page.getByText("Add CSV export to the report screen")).toBeVisible();
  await expect(page.getByRole("link", { name: /bee\/myapp-41/ })).toBeVisible();
  await expect(page.getByText("no session yet").first()).toBeVisible();
});

test("lọc theo dự án và đổi sang kanban — cả hai nằm trong URL", async ({ page }) => {
  await signIn(page, "pm-linh");
  await page.goto("/projects");

  const filtered = page.getByRole("navigation", { name: "Filter by project" });
  await filtered.getByRole("link", { name: "blog", exact: true }).click();
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
  await signIn(page, "pm-linh");
  await page.goto("/sessions");

  await page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "myapp" })
    .click();
  await expect(page).toHaveURL(/\/projects\?p=myapp/);
  await expect(page.getByText("Add CSV export to the report screen")).toBeVisible();
});

test.describe("tạo project ngay tại chỗ (24/08)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "pm-linh");
    await page.goto("/projects");
  });

  test("nút New project mở cửa sổ, không nhảy sang /setup", async ({ page }) => {
    await page.locator("header").getByRole("button", { name: "New project" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.getByLabel("org/repo")).toBeVisible();
  });

  test("thêm xong thì hỏi env luôn, và env đó là env.d của chính slug đó", async ({ page }) => {
    await page.locator("header").getByRole("button", { name: "New project" }).click();
    await page.getByLabel("org/repo").fill("org/khach-hang");
    await page.getByRole("dialog").getByRole("button", { name: "Add project" }).click();

    // Bước hai gọi đúng slug suy ra được — env.d đánh khoá theo slug.
    await expect(page.getByText("khach-hang is registered")).toBeVisible();
    await expect(page.getByLabel("New env file path for khach-hang")).toBeVisible();
  });

  test("nút + ở sidebar mở đúng cửa sổ đó", async ({ page }) => {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "New project" })
      .click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("org/repo")).toBeVisible();
  });
});
