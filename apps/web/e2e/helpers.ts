import { expect, type Page } from "@playwright/test";

/**
 * Đăng nhập bằng provider giả. Provider này chỉ tồn tại khi
 * `GITHUB_SOURCE !== "live"` — xem `src/lib/auth/index.ts`.
 */
export async function dangNhap(page: Page, login: string): Promise<void> {
  await page.goto("/dang-nhap");
  await page.getByLabel("GitHub login").fill(login);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("button", { name: "Thoát" })).toBeVisible();
}
