import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test.beforeEach(async ({ page }) => {
  await dangNhap(page, "pm-linh");
});

test("các khối chính, đúng thứ tự đã duyệt", async ({ page }) => {
  const main = page.getByRole("main");
  for (const ten of ["Claude", "Active sessions", "Last seven days"]) {
    await expect(main.getByText(ten, { exact: true })).toBeVisible();
  }
});

test("hạn mức hiện thanh phần trăm và đồng hồ tới cửa sổ mới", async ({ page }) => {
  const nam = page.getByRole("progressbar", { name: "5-hour limit" });
  await expect(nam).toBeVisible();
  await expect(nam).toHaveAttribute("aria-valuenow", "38");

  await expect(page.getByRole("progressbar", { name: "Weekly limit" })).toHaveAttribute(
    "aria-valuenow",
    "81",
  );
  await expect(page.getByText(/new window in/).first()).toBeVisible();
});

test("biểu đồ bảy ngày dựng đủ bảy cột và gọi tên xu hướng", async ({ page }) => {
  await expect(page.getByText("Last seven days")).toBeVisible();
  await expect(page.getByText(/runs failed today|runs finished today/)).toBeVisible();
  await expect(page.getByText("Today", { exact: true })).toBeVisible();
});
