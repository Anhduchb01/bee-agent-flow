import { expect, test } from "@playwright/test";

/**
 * Route này được gọi theo lịch, không phải bởi người dùng — nên nó không có
 * session để kiểm. Trên fixture, chưa cấu hình webhook thì nó trả payload ra
 * thay vì gửi, và logic gộp kiểm được ngay tại đây.
 *
 * **Tên file bắt đầu bằng "bao-" là có chủ đích.** Playwright chạy tuần tự theo
 * thứ tự bảng chữ cái (xem playwright.config.ts), và mọi server action đều ghi
 * "vừa thao tác trong app" cho người bấm — đúng như thiết kế, vì người đang
 * ngồi trong app không cần một tin Slack. Nếu file này chạy sau `tao-va-duyet`
 * thì cả hai người đều bị bỏ qua vì lý do đó, và bài test sẽ đo một thứ khác
 * với thứ nó định đo. Ràng buộc này viết ra ở đây thay vì để nó ẩn trong một
 * lần đổi tên file nào đó về sau.
 */
test("lượt đầu bắn một tin gộp, có link mở thẳng vào task", async ({ request }) => {
  const res = await request.post("/api/notify");
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.daGuiThat).toBe(false);

  const pm = body.gui.find((g: { login: string }) => g.login === "pm-linh");
  expect(pm).toBeDefined();
  expect(pm.keys.length).toBeGreaterThan(1);
  // Nhiều mục → một tin duy nhất cho người đó.
  expect(body.gui.filter((g: { login: string }) => g.login === "pm-linh")).toHaveLength(1);
  expect(pm.text).toContain("việc đang chờ bạn");
  expect(pm.text).toMatch(/→ \S+\/t\/\w+\/\d+/);
});

test("gọi lại ngay sau đó thì không bắn lại", async ({ request }) => {
  await request.post("/api/notify");
  const res = await request.post("/api/notify");

  const body = await res.json();
  expect(body.gui).toEqual([]);
  expect(Object.values(body.boQua).join(" ")).toMatch(/gộp vào lượt sau|không có mục nào mới/);
});
