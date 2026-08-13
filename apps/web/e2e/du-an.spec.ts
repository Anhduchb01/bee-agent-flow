import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test("danh sách dự án có dải thống kê", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: "Thêm dự án" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Dự án");
  await expect(page.getByText("Agent đang làm").first()).toBeVisible();
  await expect(page.getByText("PR đang mở").first()).toBeVisible();
});

test.describe("chi tiết dự án", () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, "pm-linh");
    await page.goto("/p/myapp");
  });

  test("mặc định là kiểu bảng, liệt kê task kèm giai đoạn", async ({ page }) => {
    const bang = page.getByRole("list", { name: "Task của dự án" });
    await expect(bang).toBeVisible();
    await expect(bang).toContainText("Lọc đơn hàng theo trạng thái");
    await expect(bang).toContainText("Chờ duyệt PR");
  });

  test("ấn vào task mở được trang chi tiết", async ({ page }) => {
    await page.getByRole("link", { name: "Lọc đơn hàng theo trạng thái" }).click();

    await expect(page).toHaveURL(/\/t\/myapp\/40/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Lọc đơn hàng theo trạng thái",
    );
  });

  test("chuyển sang kanban, kiểu xem nằm trong URL", async ({ page }) => {
    await page.getByRole("link", { name: "Kanban" }).click();

    await expect(page).toHaveURL(/view=kanban/);
    const board = page.getByRole("group", { name: "Bảng kanban" });
    await expect(board).toBeVisible();
    await expect(page.getByRole("list", { name: "Task của dự án" })).toHaveCount(0);
  });

  // Bảng mất cột khi rỗng thì mỗi lần mở lại có hình dạng khác, và người dùng
  // không còn học được vị trí của thứ gì.
  test("kanban luôn đủ sáu cột, kể cả cột rỗng", async ({ page }) => {
    await page.goto("/p/myapp?view=kanban");

    const cols = page.getByRole("group", { name: "Bảng kanban" }).getByRole("region");
    await expect(cols).toHaveCount(6);
    for (const ten of [
      "Nháp",
      "Chờ chấm spec",
      "Chờ giao cho agent",
      "Agent đang làm",
      "Chờ duyệt PR",
      "Cần người",
    ]) {
      await expect(page.getByRole("region", { name: ten })).toBeVisible();
    }
  });

  test("thẻ kanban nằm đúng cột theo nhãn thật", async ({ page }) => {
    await page.goto("/p/myapp?view=kanban");

    await expect(page.getByRole("region", { name: "Cần người" })).toContainText("#47");
    await expect(page.getByRole("region", { name: "Chờ duyệt PR" })).toContainText("#40");
    await expect(page.getByRole("region", { name: "Chờ giao cho agent" })).toContainText("#41");
  });

  // Cuộn ngang trong kanban là cái bẫy: hai cột cuối — "Chờ duyệt PR" và
  // "Cần người", đúng hai cột chứa việc cần người nhất — lại là hai cột nằm
  // ngoài tầm mắt.
  test("kanban vừa màn hình, không phải cuộn ngang", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/p/myapp?view=kanban");

    const board = page.getByRole("group", { name: "Bảng kanban" });
    await expect(board).toBeVisible();

    const tran = await board.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(tran).toBe(false);

    // Cột cuối nhìn thấy được mà không phải cuộn.
    await expect(page.getByRole("region", { name: "Cần người" })).toBeInViewport();
  });

  test("thẻ kanban mở được trang task", async ({ page }) => {
    await page.goto("/p/myapp?view=kanban");
    await page.getByRole("region", { name: "Cần người" }).getByRole("link").first().click();

    await expect(page).toHaveURL(/\/t\/myapp\/47/);
  });

  test("quay lại kiểu bảng", async ({ page }) => {
    await page.goto("/p/myapp?view=kanban");
    await page.getByRole("link", { name: "Bảng" }).click();

    await expect(page.getByRole("list", { name: "Task của dự án" })).toBeVisible();
  });
});
