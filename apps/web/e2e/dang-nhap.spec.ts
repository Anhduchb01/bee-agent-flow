import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test("chưa đăng nhập thì bị đưa về trang đăng nhập", async ({ page }) => {
  await page.goto("/viec");

  await expect(page).toHaveURL(/\/dang-nhap/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("bee");
});

test("người trong allowlist thấy tên mình", async ({ page }) => {
  await dangNhap(page, "pm-linh");

  await expect(page.getByText("Nguyễn Thị Linh")).toBeVisible();
  await expect(page.getByRole("link", { name: "Your work" })).toBeVisible();
});

test("techlead vào được và hiện đúng vai trò", async ({ page }) => {
  await dangNhap(page, "tl-duc");

  await expect(page.getByText("Phạm Đức")).toBeVisible();
  await expect(page.getByText("tl", { exact: true })).toBeVisible();
});

// AC quan trọng nhất của W3: đăng nhập **thành công** nhưng không thấy dữ liệu.
// Nếu người ngoài bị chặn ở bước đăng nhập thì đây là một app khác, và phần
// allowlist chưa từng được kiểm.
test("người ngoài allowlist đăng nhập được nhưng không thấy dữ liệu nào", async ({ page }) => {
  await page.goto("/dang-nhap");
  await page.getByLabel("GitHub login").fill("nguoi-la");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("do not have access");
  await expect(page.getByText("nguoi-la")).toBeVisible();

  // Không một mảnh dữ liệu nào của hệ thống lọt ra.
  await expect(page.getByRole("link", { name: "Your work" })).toHaveCount(0);
  await expect(page.getByText("myapp")).toHaveCount(0);
  await expect(page.getByText("Nguyễn Thị Linh")).toHaveCount(0);
});

test("thoát rồi thì không xem tiếp được", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/dang-nhap/);

  await page.goto("/viec");
  await expect(page).toHaveURL(/\/dang-nhap/);
});
