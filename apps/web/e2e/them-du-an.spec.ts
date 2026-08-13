import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test.describe("thêm dự án", () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, "pm-linh");
    await page.goto("/du-an");
    await page.getByRole("button", { name: "Thêm dự án" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  // App không có sudo và không giữ token orchestrator, nên nó không chạy được
  // `be repo add`. Nói trước điều đó thay vì để người dùng chờ máy động tĩnh.
  test("nói trước rằng còn một bước trên máy agent", async ({ page }) => {
    await page.getByLabel("org/repo").fill("org/khach-hang");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Còn một bước trên máy agent");
    await expect(dialog).toContainText("be repo add org/khach-hang");
  });

  test("thêm xong thì dự án hiện trong danh sách", async ({ page }) => {
    await page.getByLabel("org/repo").fill("org/khach-hang");
    await page.getByRole("dialog").getByRole("button", { name: "Thêm dự án" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "khach-hang" })).toBeVisible();
    // Reconciler chưa biết nó — và đó là sự thật cần nói ra, không phải chi tiết cần giấu.
    await expect(page.getByText("reconciler chưa biết dự án này").first()).toBeVisible();
  });

  test("từ chối tên sai định dạng", async ({ page }) => {
    await page.getByLabel("org/repo").fill("không-phải-org-repo");
    await page.getByRole("dialog").getByRole("button", { name: "Thêm dự án" }).click();

    await expect(page.getByRole("alert")).toContainText("org/repo");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("từ chối dự án trùng tên", async ({ page }) => {
    await page.getByLabel("org/repo").fill("org/myapp");
    await page.getByRole("dialog").getByRole("button", { name: "Thêm dự án" }).click();

    await expect(page.getByRole("alert")).toContainText("Đã có dự án");
  });

  test("dự án mới vào được và tạo task được ngay", async ({ page }) => {
    await page.getByLabel("org/repo").fill("org/kho-hang");
    await page.getByRole("dialog").getByRole("button", { name: "Thêm dự án" }).click();
    await page.getByRole("link", { name: "kho-hang" }).click();

    await expect(page).toHaveURL(/\/p\/kho-hang/);
    await expect(page.getByText("Chưa có task nào")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tạo task" })).toBeVisible();
  });
});
