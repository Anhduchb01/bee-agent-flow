import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

const KHOI = `# Thêm tìm kiếm theo mã đơn

### Goal

Người vận hành tìm được đơn bằng mã đơn thay vì cuộn hết trang.

### Acceptance Criteria

- [ ] Given mã đơn hợp lệ, When gõ vào ô tìm, Then đơn đó hiện ra.

### Technical constraints

Chỉ đụng module đơn hàng.

### Out of scope

Không làm tìm kiếm mờ.

### UI Reference

Ô tìm kiếm trên đầu bảng.`;

/**
 * Chặn `/api/spec-chat` và trả về một luồng NDJSON dựng sẵn.
 *
 * Bài test này KHÔNG kiểm chất lượng câu hỏi của agent — thứ đó không kiểm được
 * bằng test, và một bài test gọi model thật thì vừa chậm vừa flake vừa tốn hạn
 * mức. Thứ nó kiểm là phần cơ khí: gom NDJSON theo dòng, bóc khối ```task, dựng
 * thẻ hợp đồng, và tạo issue dưới tên người bấm.
 *
 * Cắt câu trả lời làm nhiều chunk có chủ ý, và cắt NGANG một dòng JSON — đó là
 * chuyện bình thường của mạng, và là chỗ một bộ gom viết ẩu sẽ vỡ.
 */
async function gaAgent(page: import("@playwright/test").Page, tra: string) {
  await page.route("**/api/spec-chat", async (route) => {
    const dong = [
      JSON.stringify({ type: "text", text: tra }),
      JSON.stringify({ type: "done", session_id: "11111111-2222-3333-4444-555555555555" }),
    ].join("\n") + "\n";
    const cat = Math.floor(dong.length / 2);
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/x-ndjson" },
      body: dong.slice(0, cat) + dong.slice(cat),
    });
  });
}

/** Mở modal tạo task từ chi tiết dự án — không còn màn hình riêng. */
async function moModalTaoTask(page: import("@playwright/test").Page, slug = "myapp") {
  await page.goto(`/p/${slug}`);
  await page.getByRole("button", { name: "New task" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function noi(page: import("@playwright/test").Page, text: string) {
  await page.getByRole("dialog").getByRole("textbox").fill(text);
  await page.getByRole("dialog").getByRole("button", { name: "Send" }).click();
}

// Không còn ô nào để điền. Đây là thứ thay thế cả cái form năm mục.
test("tạo task bắt đầu bằng một câu, không phải một cái form", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await gaAgent(page, "Q: bạn muốn tìm theo mã hay theo tên?\nGUESS: theo mã.");
  await moModalTaoTask(page);

  // Không có ô Goal / Acceptance Criteria / … nào cả.
  for (const nhan of ["Goal", "Acceptance Criteria", "Out of scope", "UI Reference"]) {
    await expect(page.getByRole("dialog").getByLabel(nhan)).toHaveCount(0);
  }

  await noi(page, "Danh sách đơn khó tìm quá");
  await expect(page.getByRole("dialog")).toContainText("bạn muốn tìm theo mã hay theo tên?");
  // Chưa có hợp đồng thì chưa có nút tạo — không tạo được task rỗng.
  await expect(page.getByRole("dialog").getByRole("button", { name: "Create task" })).toHaveCount(0);
});

test("khối task thành thẻ hợp đồng, không phải markdown thô", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await gaAgent(page, `Đủ rồi, đây là bản nháp:\n\n\`\`\`task\n${KHOI}\n\`\`\`\n`);
  await moModalTaoTask(page);
  await noi(page, "Tìm theo mã đơn");

  const hopDong = page.getByRole("dialog");
  await expect(hopDong).toContainText("Draft contract");
  await expect(hopDong).toContainText("Thêm tìm kiếm theo mã đơn");
  await expect(hopDong).toContainText("Không làm tìm kiếm mờ.");
  // Khối thô bị cắt khỏi bong bóng chat — hiện cùng một thứ hai lần là thừa.
  await expect(hopDong).not.toContainText("```task");
  await expect(hopDong).not.toContainText("### Goal");
});

test("thiếu mục thì nói tên mục, không tạo hợp đồng rỗng", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  const thieu = KHOI.replace(/### Out of scope[\s\S]*?(?=### UI)/, "");
  await gaAgent(page, `\`\`\`task\n${thieu}\n\`\`\``);
  await moModalTaoTask(page);
  await noi(page, "Tìm theo mã đơn");

  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Out of scope");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Create task" })).toHaveCount(0);
});

test("tạo task → issue mới mang tên người tạo, gắn status:ready-for-spec", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await gaAgent(page, `\`\`\`task\n${KHOI}\n\`\`\``);
  await moModalTaoTask(page);
  await noi(page, "Tìm theo mã đơn");

  await page.getByRole("dialog").getByRole("button", { name: "Create task" }).click();

  // Dự án lấy từ chỗ đang đứng, không phải từ một ô chọn lặp lại điều đó.
  await expect(page).toHaveURL(/\/t\/myapp\/\d+/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Thêm tìm kiếm theo mã đơn");
  await expect(page.getByText("opened by Nguyễn Thị Linh")).toBeVisible();
  await expect(page.getByText("status:ready-for-spec")).toBeVisible();
  // Cả năm mục nằm nguyên trong body — đây là hợp đồng rule 08 đọc.
  await expect(page.getByText("Out of scope")).toBeVisible();
  await expect(page.getByText("UI Reference")).toBeVisible();
});

test("PM duyệt PR → approve mang tên PM, trạng thái đổi", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/t/myapp/40");

  // Dải thống kê là chỗ đọc nhanh; khối trạng thái bên dưới lặp lại có chủ ý,
  // nên assertion phải chỉ đúng một trong hai chứ không được mơ hồ.
  const thongKe = page.locator("dl");
  await expect(thongKe).toContainText("nobody has approved");

  await page.getByRole("button", { name: "Approve PR" }).click();

  await expect(page.getByText("Approved — merge it on GitHub")).toBeVisible();
  await expect(thongKe).toContainText("Nguyễn Thị Linh");
  // Duyệt xong thì nút biến mất — không duyệt hai lần.
  await expect(page.getByRole("button", { name: "Approve PR" })).toHaveCount(0);
});

test("PM duyệt spec → nhãn chuyển sang agent:build", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/t/shop/12");

  await page.getByRole("button", { name: "Approve spec" }).click();

  await expect(page.getByText("Spec approved")).toBeVisible();
  await expect(page.getByText("agent:build")).toBeVisible();
  await expect(page.getByText("status:spec-review")).toHaveCount(0);
});

test("TL không duyệt được spec", async ({ page }) => {
  await dangNhap(page, "tl-duc");
  await page.goto("/t/myapp/38");

  await expect(page.getByRole("button", { name: "Approve spec" })).toHaveCount(0);
});

test("giao cho agent gắn agent:eligible", async ({ page }) => {
  await dangNhap(page, "tl-duc");
  await page.goto("/t/myapp/41");

  await page.getByRole("button", { name: "Giao cho agent" }).click();

  await expect(page.getByText("Assigned")).toBeVisible();
  await expect(page.getByText("agent:eligible")).toBeVisible();
});

test("chat vào task → comment mang tên người gửi, không có spinner vô tận", async ({ page }) => {
  await dangNhap(page, "tl-duc");
  await page.goto("/t/myapp/49");

  await expect(page.getByText("The agent sees it on the next tick")).toBeVisible();

  await page.getByLabel("Continue with the agent").fill("Write it to audit_events.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("sent · waiting for the next tick")).toBeVisible();

  const items = page.getByRole("list", { name: "Timeline" }).getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.last()).toContainText("Phạm Đức");
  await expect(items.last()).toContainText("audit_events");
  // @claude được thêm tự động để rule 02 nhặt được.
  await expect(items.last()).toContainText("@claude");
});
