import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test("issue và PR liên kết hiện thành một trang", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/t/myapp/40");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Filter orders by status",
  );

  // Phần issue.
  await expect(page.getByText("Acceptance Criteria")).toBeVisible();
  await expect(page.getByText("Given the orders list").first()).toBeVisible();

  // Dải con số trả lời trước khi phải đọc hợp đồng.
  await expect(page.getByText("bee/test").first()).toBeVisible();
  await expect(page.getByText("Approved").first()).toBeVisible();

  // Phần PR, trên cùng một trang.
  await expect(page.getByRole("link", { name: "#45 on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/org/myapp/pull/45",
  );
  await expect(page.getByText("bee/test · xanh")).toBeVisible();
  await expect(page.getByText("9f3c1ab").first()).toBeVisible();
});

test("dòng thời gian xen kẽ theo thứ tự thật", async ({ page }) => {
  await dangNhap(page, "tl-duc");
  await page.goto("/t/myapp/49");

  // Không khẳng định số lượng: bài test chat ghi thêm comment vào chính task
  // này, và store fixture sống suốt cả lượt chạy. Thứ tự mới là điều đang kiểm.
  const items = page.getByRole("list", { name: "Timeline" }).getByRole("listitem");
  await expect(items.nth(0)).toContainText("Phạm Đức");
  await expect(items.nth(1)).toContainText("bee (agent)");
  await expect(items.nth(1)).toContainText("agent");
  // Dấu <!-- agent-run --> không được lọt ra màn hình.
  await expect(items.nth(1)).not.toContainText("agent-run");
});

test("bằng chứng phát ngay trong trang", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/t/myapp/40");

  const anh = page.locator('img[src^="/api/evidence/"]');
  await expect(anh.first()).toBeVisible();

  // Ảnh thật sự tải được, không phải một thẻ img gãy.
  const kichThuoc = await anh.first().evaluate((el: HTMLImageElement) => el.naturalWidth);
  expect(kichThuoc).toBeGreaterThan(0);
});

test("task chưa có bằng chứng thì nói rõ, không để trống", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/t/myapp/38");

  await expect(page.getByText("No evidence for this commit yet")).toBeVisible();
});

test("issue thiếu mục thì báo hợp đồng chưa đủ", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/t/shop/33");

  await expect(page.getByText("Incomplete contract")).toBeVisible();
  await expect(page.getByText("Acceptance Criteria")).toBeVisible();
});
