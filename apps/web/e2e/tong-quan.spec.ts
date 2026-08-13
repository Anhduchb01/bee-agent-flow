import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test.beforeEach(async ({ page }) => {
  await dangNhap(page, "pm-linh");
});

test("bốn khối, đúng thứ tự đã duyệt", async ({ page }) => {
  const main = page.getByRole("main");
  for (const ten of ["Claude", "Machine is working", "Projects", "Last seven days"]) {
    await expect(main.getByText(ten, { exact: true })).toBeVisible();
  }

  // Hai khối bị bỏ vì lặp lại màn "Việc của bạn".
  await expect(main.getByText("Needs you now")).toHaveCount(0);
  await expect(main.getByText("Longest blocked")).toHaveCount(0);
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

test("máy đang làm nói được việc gì, không chỉ số hiệu", async ({ page }) => {
  const khoi = page.getByRole("main").getByText("Machine is working").locator("../..");
  await expect(khoi).toContainText("myapp#42");
  await expect(khoi).toContainText("Add a notification settings page");
  await expect(khoi).toContainText("07-build");
});

// Đây là toàn bộ lý do khối "Dự án" tồn tại: hai dự án khác hẳn nhau mà một cột
// "tổng số task" không phân biệt được.
test("mỗi dự án một thanh chia theo giai đoạn, trên trục chung", async ({ page }) => {
  const khoi = page.getByRole("main").getByText("Projects", { exact: true }).locator("../..");

  // Tên dự án là nhãn trục, và cả sáu giai đoạn có mặt trong chú giải.
  for (const ten of ["myapp", "shop", "blog"]) {
    await expect(khoi.getByText(ten, { exact: true })).toBeVisible();
  }
  for (const ten of ["Needs human", "Agent working", "PR review"]) {
    await expect(khoi.getByText(ten, { exact: true })).toBeVisible();
  }
});

test("biểu đồ bảy ngày dựng đủ bảy cột và gọi tên xu hướng", async ({ page }) => {
  await expect(page.getByText("Last seven days")).toBeVisible();
  await expect(page.getByText(/runs failed today|runs finished today/)).toBeVisible();
  await expect(page.getByText("Today", { exact: true })).toBeVisible();
});
