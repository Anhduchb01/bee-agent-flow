import { expect, test } from "@playwright/test";

import { vaoViec } from "./helpers";

test("PM thấy việc đang chặn mình, xếp chờ lâu nhất lên đầu", async ({ page }) => {
  await vaoViec(page, "pm-linh");

  const bang = page.getByRole("group", { name: "Việc đang chờ bạn" });
  await expect(bang).toBeVisible();

  const rows = bang.getByRole("listitem");
  await expect(rows.first()).toContainText("blog#9");
  await expect(rows.first()).toContainText("Cần người");

  await expect(bang).toContainText("Duyệt spec");
  await expect(bang).toContainText("Cho phép nhận task");
  await expect(bang).toContainText("Duyệt PR");
});

test("việc gộp theo dự án, dự án có việc thối rữa lâu nhất lên đầu", async ({ page }) => {
  await vaoViec(page, "pm-linh");

  const nhom = page.getByRole("group", { name: "Việc đang chờ bạn" }).getByRole("region");
  await expect(nhom.first()).toHaveAccessibleName("Dự án blog");

  // Gộp là để dễ đọc, không phải để đánh mất thứ tự khẩn cấp.
  const ten = await nhom.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(ten).toEqual(["Dự án blog", "Dự án myapp", "Dự án shop"]);

  // Đầu nhóm nói luôn nhóm đó có gì, để không phải đếm bằng mắt.
  await expect(page.getByRole("region", { name: "Dự án blog" })).toContainText("1 việc");
});

test("TL thấy danh sách khác PM", async ({ page }) => {
  await vaoViec(page, "tl-duc");

  const bang = page.getByRole("group", { name: "Việc đang chờ bạn" });
  await expect(bang).toContainText("Agent hỏi ngược");
  await expect(bang).not.toContainText("Duyệt spec");
});

test("dải thống kê nói được bốn con số đầu ngày", async ({ page }) => {
  await vaoViec(page, "pm-linh");

  await expect(page.getByText("Cần người", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Chờ bạn duyệt")).toBeVisible();
  await expect(page.getByText("Chờ lâu nhất")).toBeVisible();
});

// Bình thường thì nó là một dòng. Chiếm bốn ô số ở đầu màn hình để nói "không
// có gì xảy ra" là lấy mất chỗ của thông tin thật.
// Khối đầy đủ sống ở Tổng quan; sidebar chỉ mang bản tóm tắt một dòng.
test("sức khoẻ hệ thống co lại một dòng khi mọi thứ bình thường", async ({ page }) => {
  await vaoViec(page, "pm-linh");
  await page.goto("/");

  const health = page.getByRole("region", { name: "Sức khoẻ hệ thống" });
  await expect(health).toContainText("Hệ thống đang chạy");
  await expect(health).toContainText("build 1/3");
  await expect(health).toContainText("hàng đợi 1");
});

test.describe("bộ lọc trên từng cột", () => {
  test.beforeEach(async ({ page }) => {
    await vaoViec(page, "pm-linh");
  });

  test("lọc theo loại việc", async ({ page }) => {
    await page.getByLabel("Lọc theo loại").selectOption("can-nguoi");

    const rows = page.getByRole("group", { name: "Việc đang chờ bạn" }).getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Cần người");
    await expect(page.getByText(/Hiện 2\/\d+ việc/)).toBeVisible();
  });

  test("lọc theo dự án", async ({ page }) => {
    await page.getByLabel("Lọc theo dự án").selectOption("shop");

    const rows = page.getByRole("group", { name: "Việc đang chờ bạn" }).getByRole("listitem");
    for (const row of await rows.all()) await expect(row).toContainText("shop#");
  });

  test("ô tìm chấp nhận gõ không dấu", async ({ page }) => {
    await page.getByLabel("Tìm trong tiêu đề").fill("tinh thue");

    // Fixture có hai task về tính thuế; cả hai đều phải khớp khi gõ không dấu.
    const rows = page.getByRole("group", { name: "Việc đang chờ bạn" }).getByRole("listitem");
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) await expect(row).toContainText("thuế");
  });

  test("lọc theo thời gian đã chờ", async ({ page }) => {
    await page.getByLabel("Lọc theo thời gian đã chờ").selectOption("86400");

    const rows = page.getByRole("group", { name: "Việc đang chờ bạn" }).getByRole("listitem");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("blog#9");
  });

  test("chỉ ưu tiên", async ({ page }) => {
    await page.getByLabel("Chỉ ưu tiên").check();

    const rows = page.getByRole("group", { name: "Việc đang chờ bạn" }).getByRole("listitem");
    for (const row of await rows.all()) await expect(row).toContainText("ưu tiên");
  });

  // Bảng rỗng vì lọc và bảng rỗng vì hết việc là hai chuyện khác nhau, và
  // người dùng phải phân biệt được ngay.
  test("lọc ra rỗng thì nói là do lọc, không nói là hết việc", async ({ page }) => {
    await page.getByLabel("Tìm trong tiêu đề").fill("chuỗi không tồn tại");

    await expect(page.getByText("Không có việc nào khớp bộ lọc.")).toBeVisible();
    await expect(page.getByText("Mọi thứ đang ở phía máy")).toHaveCount(0);
  });

  test("bỏ lọc trả lại đủ danh sách", async ({ page }) => {
    const rows = page.getByRole("group", { name: "Việc đang chờ bạn" }).getByRole("listitem");
    const truoc = await rows.count();

    await page.getByLabel("Lọc theo dự án").selectOption("shop");
    await page.getByRole("button", { name: "Bỏ lọc" }).click();

    await expect(rows).toHaveCount(truoc);
    await expect(page.getByRole("button", { name: "Bỏ lọc" })).toHaveCount(0);
  });
});
