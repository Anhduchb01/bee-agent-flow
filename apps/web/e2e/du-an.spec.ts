import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test("danh sách dự án có dải thống kê", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Add project" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Projects");
  await expect(page.getByText("Agents working").first()).toBeVisible();
  await expect(page.getByText("Open PRs").first()).toBeVisible();
});

test.describe("chi tiết dự án", () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, "pm-linh");
    await page.goto("/p/myapp");
  });

  test("mặc định là kiểu bảng, liệt kê task kèm giai đoạn", async ({ page }) => {
    const bang = page.getByRole("list", { name: "Project tasks" });
    await expect(bang).toBeVisible();
    await expect(bang).toContainText("Filter orders by status");
    await expect(bang).toContainText("PR review");
  });

  test("ấn vào task mở được trang chi tiết", async ({ page }) => {
    await page.getByRole("link", { name: "Filter orders by status" }).click();

    await expect(page).toHaveURL(/\/t\/myapp\/40/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Filter orders by status",
    );
  });

  test("chuyển sang kanban, kiểu xem nằm trong URL", async ({ page }) => {
    await page.getByRole("link", { name: "Kanban" }).click();

    await expect(page).toHaveURL(/view=kanban/);
    const board = page.getByRole("group", { name: "Kanban board" });
    await expect(board).toBeVisible();
    await expect(page.getByRole("list", { name: "Project tasks" })).toHaveCount(0);
  });

  // Bảng mất cột khi rỗng thì mỗi lần mở lại có hình dạng khác, và người dùng
  // không còn học được vị trí của thứ gì.
  test("kanban luôn đủ sáu cột, kể cả cột rỗng", async ({ page }) => {
    await page.goto("/p/myapp?view=kanban");

    const cols = page.getByRole("group", { name: "Kanban board" }).getByRole("region");
    await expect(cols).toHaveCount(6);
    for (const ten of [
      "Draft",
      "Spec review",
      "Ready to assign",
      "Agent working",
      "PR review",
      "Needs human",
    ]) {
      await expect(page.getByRole("region", { name: ten })).toBeVisible();
    }
  });

  test("thẻ kanban nằm đúng cột theo nhãn thật", async ({ page }) => {
    await page.goto("/p/myapp?view=kanban");

    await expect(page.getByRole("region", { name: "Needs human" })).toContainText("#47");
    await expect(page.getByRole("region", { name: "PR review" })).toContainText("#40");
    await expect(page.getByRole("region", { name: "Ready to assign" })).toContainText("#41");
  });

  // Cuộn ngang trong kanban là cái bẫy: hai cột cuối — "Chờ duyệt PR" và
  // "Cần người", đúng hai cột chứa việc cần người nhất — lại là hai cột nằm
  // ngoài tầm mắt.
  test("kanban vừa màn hình, không phải cuộn ngang", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/p/myapp?view=kanban");

    const board = page.getByRole("group", { name: "Kanban board" });
    await expect(board).toBeVisible();

    const tran = await board.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(tran).toBe(false);

    // Cột cuối nhìn thấy được mà không phải cuộn.
    await expect(page.getByRole("region", { name: "Needs human" })).toBeInViewport();
  });

  test("thẻ kanban mở được trang task", async ({ page }) => {
    await page.goto("/p/myapp?view=kanban");
    await page.getByRole("region", { name: "Needs human" }).getByRole("link").first().click();

    await expect(page).toHaveURL(/\/t\/myapp\/47/);
  });

  test("quay lại kiểu bảng", async ({ page }) => {
    await page.goto("/p/myapp?view=kanban");
    await page.getByRole("link", { name: "Table" }).click();

    await expect(page.getByRole("list", { name: "Project tasks" })).toBeVisible();
  });
});
