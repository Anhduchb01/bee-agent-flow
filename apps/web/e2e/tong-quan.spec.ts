import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test.beforeEach(async ({ page }) => {
  await dangNhap(page, "pm-linh");
});

test("bốn khối, đúng thứ tự đã duyệt", async ({ page }) => {
  const main = page.getByRole("main");
  for (const ten of ["Claude", "Máy đang làm", "Dự án", "Bảy ngày qua"]) {
    await expect(main.getByText(ten, { exact: true })).toBeVisible();
  }

  // Hai khối bị bỏ vì lặp lại màn "Việc của bạn".
  await expect(main.getByText("Cần bạn ngay")).toHaveCount(0);
  await expect(main.getByText("Chặn lâu nhất")).toHaveCount(0);
});

test("hạn mức hiện thanh phần trăm và đồng hồ tới cửa sổ mới", async ({ page }) => {
  const nam = page.getByRole("progressbar", { name: "Hạn mức 5 giờ" });
  await expect(nam).toBeVisible();
  await expect(nam).toHaveAttribute("aria-valuenow", "38");

  await expect(page.getByRole("progressbar", { name: "Hạn mức tuần" })).toHaveAttribute(
    "aria-valuenow",
    "81",
  );
  await expect(page.getByText(/cửa sổ mới sau/).first()).toBeVisible();
});

test("máy đang làm nói được việc gì, không chỉ số hiệu", async ({ page }) => {
  const khoi = page.getByRole("main").getByText("Máy đang làm").locator("../..");
  await expect(khoi).toContainText("myapp#42");
  await expect(khoi).toContainText("Thêm trang cài đặt thông báo");
  await expect(khoi).toContainText("07-build");
});

// Đây là toàn bộ lý do khối "Dự án" tồn tại: hai dự án khác hẳn nhau mà một cột
// "tổng số task" không phân biệt được.
test("mỗi dự án một thanh chia theo giai đoạn", async ({ page }) => {
  const blog = page.getByRole("img", { name: /^blog:/ });
  await expect(blog).toBeVisible();
  await expect(blog).toHaveAccessibleName(/cần người/);

  const myapp = page.getByRole("img", { name: /^myapp:/ });
  await expect(myapp).toHaveAccessibleName(/agent đang làm/);
});

test("biểu đồ bảy ngày dựng đủ bảy cột và gọi tên xu hướng", async ({ page }) => {
  await expect(page.getByText("Bảy ngày qua")).toBeVisible();
  await expect(page.getByText(/lần chạy thất bại|lần chạy xong/)).toBeVisible();
  await expect(page.getByText("Hôm nay", { exact: true })).toBeVisible();
});
