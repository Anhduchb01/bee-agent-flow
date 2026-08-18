import { expect, type Page } from "@playwright/test";

/**
 * Switch the fixture scene via cookie. Only `lib/bee/fixture.ts` reads it,
 * so no screen knows it is looking at a fixture and it is inert on a real
 * machine. Domain-based (no URL) so it works on any E2E_PORT.
 */
export async function datCanh(page: Page, canh: string): Promise<void> {
  await page.context().addCookies([{ name: "bee-canh", value: canh, domain: "127.0.0.1", path: "/" }]);
}

/**
 * Đăng nhập bằng provider giả. Provider này chỉ tồn tại khi
 * `GITHUB_SOURCE !== "live"` — xem `src/lib/auth/index.ts`.
 */
export async function dangNhap(page: Page, login: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("GitHub login").fill(login);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Chờ RỜI KHỎI trang đăng nhập, không chờ một heading xuất hiện: trang đăng
  // nhập cũng có <h1> ("bee"), nên khẳng định theo heading đúng ngay lập tức và
  // helper trả về trước khi điều hướng xong — cả suite chạy đua với router.
  //
  // Cũng không dùng nút "Thoát" làm dấu hiệu: trên điện thoại sidebar nằm ngoài
  // màn hình nên nút đó chưa hiện.
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
