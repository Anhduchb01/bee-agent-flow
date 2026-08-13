import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

const HOP_LE = {
  title: "Thêm tìm kiếm theo mã đơn",
  goal: "Người vận hành tìm được đơn bằng mã đơn thay vì cuộn hết trang.",
  acceptance: "- [ ] Given mã đơn hợp lệ, When gõ vào ô tìm, Then đơn đó hiện ra.",
  constraints: "Chỉ đụng module đơn hàng.",
  out_of_scope: "Không làm tìm kiếm mờ.",
  ui_reference: "Ô tìm kiếm trên đầu bảng.",
};

/** Mở modal tạo task từ chi tiết dự án — không còn màn hình riêng. */
async function moModalTaoTask(page: import("@playwright/test").Page, slug = "myapp") {
  await page.goto(`/p/${slug}`);
  await page.getByRole("button", { name: "Tạo task" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function dienForm(page: import("@playwright/test").Page, bo: Partial<typeof HOP_LE> = {}) {
  const gia = { ...HOP_LE, ...bo };
  await page.getByLabel("Tiêu đề").fill(gia.title);
  await page.getByLabel("Mục tiêu").fill(gia.goal);
  await page.getByLabel("Acceptance Criteria").fill(gia.acceptance);
  await page.getByLabel("Ràng buộc kỹ thuật").fill(gia.constraints);
  await page.getByLabel("Out of scope").fill(gia.out_of_scope);
  await page.getByLabel("UI Reference").fill(gia.ui_reference);
}

// Mục tiêu là làm form này DỄ ĐIỀN hơn form GitHub, không phải lỏng hơn.
test("form không cho bỏ qua mục bắt buộc nào", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await moModalTaoTask(page);

  await dienForm(page, { out_of_scope: "" });
  await page.getByRole("dialog").getByRole("button", { name: "Tạo task" }).click();

  await expect(page.locator("form").getByRole("alert")).toContainText("Out of scope");
  // Modal vẫn mở: không đá người dùng ra khỏi thứ họ đang gõ dở.
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("AC phải là checkbox, không phải văn xuôi", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await moModalTaoTask(page);

  await dienForm(page, { acceptance: "Tìm được đơn theo mã và kết quả chính xác." });
  await page.getByRole("dialog").getByRole("button", { name: "Tạo task" }).click();

  await expect(page.locator("form").getByRole("alert")).toContainText("checkbox");
});

test("tạo task → issue mới mang tên người tạo, gắn status:ready-for-spec", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await moModalTaoTask(page);

  await dienForm(page);
  await page.getByRole("dialog").getByRole("button", { name: "Tạo task" }).click();

  // Dự án lấy từ chỗ đang đứng, không phải từ một ô chọn lặp lại điều đó.
  await expect(page).toHaveURL(/\/t\/myapp\/\d+/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(HOP_LE.title);
  await expect(page.getByText("Nguyễn Thị Linh mở")).toBeVisible();
  await expect(page.getByText("status:ready-for-spec")).toBeVisible();
  // Cả năm mục nằm nguyên trong body — đây là hợp đồng rule 08 đọc.
  await expect(page.getByText("Out of scope")).toBeVisible();
  await expect(page.getByText("UI Reference")).toBeVisible();
});

test("PM duyệt PR → approve mang tên PM, trạng thái đổi", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/t/myapp/40");

  await expect(page.getByText("chưa ai duyệt")).toBeVisible();
  await page.getByRole("button", { name: "Duyệt PR" }).click();

  await expect(page.getByText("Đã duyệt — merge trên GitHub")).toBeVisible();
  await expect(page.getByText("Nguyễn Thị Linh").last()).toBeVisible();
  // Duyệt xong thì nút biến mất — không duyệt hai lần.
  await expect(page.getByRole("button", { name: "Duyệt PR" })).toHaveCount(0);
});

test("PM duyệt spec → nhãn chuyển sang agent:build", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/t/shop/12");

  await page.getByRole("button", { name: "Duyệt spec" }).click();

  await expect(page.getByText("Đã duyệt spec")).toBeVisible();
  await expect(page.getByText("agent:build")).toBeVisible();
  await expect(page.getByText("status:spec-review")).toHaveCount(0);
});

test("TL không duyệt được spec", async ({ page }) => {
  await dangNhap(page, "tl-duc");
  await page.goto("/t/myapp/38");

  await expect(page.getByRole("button", { name: "Duyệt spec" })).toHaveCount(0);
});

test("giao cho agent gắn agent:eligible", async ({ page }) => {
  await dangNhap(page, "tl-duc");
  await page.goto("/t/myapp/41");

  await page.getByRole("button", { name: "Giao cho agent" }).click();

  await expect(page.getByText("Đã giao")).toBeVisible();
  await expect(page.getByText("agent:eligible")).toBeVisible();
});

test("chat vào task → comment mang tên người gửi, không có spinner vô tận", async ({ page }) => {
  await dangNhap(page, "tl-duc");
  await page.goto("/t/myapp/49");

  await expect(page.getByText("Agent nhìn thấy ở tick sau")).toBeVisible();

  await page.getByLabel("Nói tiếp với agent").fill("Ghi vào audit_events nhé.");
  await page.getByRole("button", { name: "Gửi" }).click();

  await expect(page.getByText("đã gửi · chờ tick tiếp theo")).toBeVisible();

  const items = page.getByRole("list", { name: "Dòng thời gian" }).getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.last()).toContainText("Phạm Đức");
  await expect(items.last()).toContainText("audit_events");
  // @claude được thêm tự động để rule 02 nhặt được.
  await expect(items.last()).toContainText("@claude");
});
