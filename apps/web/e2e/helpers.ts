import { expect, type Page } from "@playwright/test";

/**
 * Đăng nhập bằng provider giả. Provider này chỉ tồn tại khi
 * `GITHUB_SOURCE !== "live"` — xem `src/lib/auth/index.ts`.
 */
export async function dangNhap(page: Page, login: string): Promise<void> {
  await page.goto("/dang-nhap");
  await page.getByLabel("GitHub login").fill(login);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // Chờ RỜI KHỎI trang đăng nhập, không chờ một heading xuất hiện: trang đăng
  // nhập cũng có <h1> ("bee"), nên khẳng định theo heading đúng ngay lập tức và
  // helper trả về trước khi điều hướng xong — cả suite chạy đua với router.
  //
  // Cũng không dùng nút "Thoát" làm dấu hiệu: trên điện thoại sidebar nằm ngoài
  // màn hình nên nút đó chưa hiện.
  await expect(page).not.toHaveURL(/\/dang-nhap/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Đăng nhập rồi vào thẳng màn "Việc của bạn" — trang chủ giờ là Tổng quan. */
export async function vaoViec(page: Page, login: string): Promise<void> {
  await dangNhap(page, login);
  await page.goto("/viec");
}
