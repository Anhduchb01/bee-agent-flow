import { expect, test } from "@playwright/test";

import { vaoViec } from "./helpers";

type Page = import("@playwright/test").Page;

const bang = (page: Page) => page.getByRole("table", { name: "Work waiting on you" });

/**
 * Hàng dữ liệu của bảng.
 *
 * Lọc theo "hàng có link tới task", không đếm mọi `row`: mỗi dự án có thêm một
 * hàng đầu nhóm, và hàng đó cũng là `row`.
 */
const hangTask = (page: Page) =>
  bang(page).getByRole("row").filter({ has: page.locator('a[href^="/t/"]') });

/** Nhóm dự án — `<tbody>` có tên. `<thead>` cũng là rowgroup nên phải lọc theo tên. */
const nhomDuAn = (page: Page) => bang(page).getByRole("rowgroup", { name: /^Project / });

test("PM thấy việc đang chặn mình, xếp chờ lâu nhất lên đầu", async ({ page }) => {
  await vaoViec(page, "pm-linh");

  await expect(bang(page)).toBeVisible();

  const rows = hangTask(page);
  await expect(rows.first()).toContainText("blog#9");
  await expect(rows.first()).toContainText("Needs human");

  await expect(bang(page)).toContainText("Review spec");
  await expect(bang(page)).toContainText("Allow agent to pick up");
  await expect(bang(page)).toContainText("Review PR");
});

test("việc gộp theo dự án, dự án có việc thối rữa lâu nhất lên đầu", async ({ page }) => {
  await vaoViec(page, "pm-linh");

  const nhom = nhomDuAn(page);
  await expect(nhom.first()).toHaveAccessibleName("Project blog");

  // Gộp là để dễ đọc, không phải để đánh mất thứ tự khẩn cấp.
  const ten = await nhom.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(ten).toEqual(["Project blog", "Project myapp", "Project shop"]);

  // Đầu nhóm nói luôn nhóm đó có gì, để không phải đếm bằng mắt.
  await expect(nhomDuAn(page).first()).toContainText("1 items");
});

test("TL thấy danh sách khác PM", async ({ page }) => {
  await vaoViec(page, "tl-duc");

  await expect(bang(page)).toContainText("Agent asked you");
  await expect(bang(page)).not.toContainText("Review spec");
});

test("dải thống kê nói được bốn con số đầu ngày", async ({ page }) => {
  await vaoViec(page, "pm-linh");

  await expect(page.getByText("Needs human", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Awaiting your review")).toBeVisible();
  await expect(page.getByText("Longest wait")).toBeVisible();
});

// Bình thường thì nó là một dòng. Chiếm bốn ô số ở đầu màn hình để nói "không
// có gì xảy ra" là lấy mất chỗ của thông tin thật.
// Khối đầy đủ sống ở Tổng quan; sidebar chỉ mang bản tóm tắt một dòng.
test("sức khoẻ hệ thống co lại một dòng khi mọi thứ bình thường", async ({ page }) => {
  await vaoViec(page, "pm-linh");
  await page.goto("/");

  const health = page.getByRole("region", { name: "System health" });
  await expect(health).toContainText("System is running");
  await expect(health).toContainText("build 1/3");
  await expect(health).toContainText("1 queued");
});

test.describe("bộ lọc trên từng cột", () => {
  test.beforeEach(async ({ page }) => {
    await vaoViec(page, "pm-linh");
  });

  test("lọc theo loại việc", async ({ page }) => {
    await page.getByLabel("Filter by kind").selectOption("can-nguoi");

    const rows = hangTask(page);
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Needs human");
    await expect(page.getByText(/Showing 2 of \d+/)).toBeVisible();
  });

  test("lọc theo dự án", async ({ page }) => {
    await page.getByLabel("Filter by project").selectOption("shop");

    const rows = hangTask(page);
    for (const row of await rows.all()) await expect(row).toContainText("shop#");
  });

  test("ô tìm chấp nhận gõ không dấu", async ({ page }) => {
    await page.getByLabel("Search titles").fill("tax");

    // Fixture có hai task về tính thuế; cả hai đều phải khớp khi gõ không dấu.
    const rows = hangTask(page);
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) await expect(row).toContainText("tax");
  });

  test("lọc theo thời gian đã chờ", async ({ page }) => {
    await page.getByLabel("Filter by time waited").selectOption("86400");

    const rows = hangTask(page);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("blog#9");
  });

  test("chỉ ưu tiên", async ({ page }) => {
    await page.getByLabel("Priority only").check();

    const rows = hangTask(page);
    for (const row of await rows.all()) await expect(row).toContainText("priority");
  });

  // Bảng rỗng vì lọc và bảng rỗng vì hết việc là hai chuyện khác nhau, và
  // người dùng phải phân biệt được ngay.
  test("lọc ra rỗng thì nói là do lọc, không nói là hết việc", async ({ page }) => {
    await page.getByLabel("Search titles").fill("no such string anywhere");

    await expect(page.getByText("Nothing matches these filters")).toBeVisible();
    await expect(page.getByText("Loosen a filter")).toBeVisible();
    await expect(page.getByText("Everything is on the machine")).toHaveCount(0);
  });

  test("bỏ lọc trả lại đủ danh sách", async ({ page }) => {
    const rows = hangTask(page);
    const truoc = await rows.count();

    await page.getByLabel("Filter by project").selectOption("shop");
    await page.getByRole("button", { name: "Clear filters" }).click();

    await expect(rows).toHaveCount(truoc);
    await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);
  });
});
