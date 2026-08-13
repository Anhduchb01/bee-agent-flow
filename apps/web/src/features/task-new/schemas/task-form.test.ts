import { describe, expect, it } from "vitest";

import { taskFormSchema, TRUONG } from "./task-form";

const hopLe = {
  slug: "myapp",
  title: "Thêm tìm kiếm theo mã đơn",
  goal: "Người vận hành tìm được đơn bằng mã đơn thay vì cuộn hết trang.",
  acceptance: "- [ ] Given mã đơn hợp lệ, When gõ vào ô tìm, Then đơn đó hiện ra.",
  constraints: "Chỉ đụng module đơn hàng.",
  out_of_scope: "Không làm tìm kiếm mờ.",
  ui_reference: "Ô tìm kiếm trên đầu bảng.",
};

describe("taskFormSchema", () => {
  it("nhận form đủ năm mục", () => {
    expect(taskFormSchema.safeParse(hopLe).success).toBe(true);
  });

  // Đây là toàn bộ lý do form này tồn tại: nó không được lỏng hơn form GitHub.
  it.each(["goal", "acceptance", "constraints", "out_of_scope", "ui_reference"] as const)(
    "từ chối khi thiếu %s",
    (field) => {
      const r = taskFormSchema.safeParse({ ...hopLe, [field]: "   " });
      expect(r.success).toBe(false);
    },
  );

  it("AC phải là checkbox, không phải văn xuôi", () => {
    const r = taskFormSchema.safeParse({
      ...hopLe,
      acceptance: "Tìm được đơn theo mã, và kết quả phải chính xác tuyệt đối.",
    });

    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain("checkbox");
  });

  it("checkbox rỗng không tính là một tiêu chí", () => {
    expect(taskFormSchema.safeParse({ ...hopLe, acceptance: "- [ ] \n- [ ]  " }).success).toBe(
      false,
    );
  });

  it("chấp nhận checkbox đã tick và dấu sao", () => {
    expect(
      taskFormSchema.safeParse({ ...hopLe, acceptance: "* [x] Given A, When B, Then C." }).success,
    ).toBe(true);
  });

  it("tiêu đề quá ngắn bị từ chối", () => {
    expect(taskFormSchema.safeParse({ ...hopLe, title: "sửa" }).success).toBe(false);
  });

  it("cắt khoảng trắng thừa", () => {
    const r = taskFormSchema.safeParse({ ...hopLe, title: `  ${hopLe.title}  ` });
    expect(r.success && r.data.title).toBe(hopLe.title);
  });

  it("danh sách trường trên UI khớp đúng năm mục của hợp đồng", () => {
    expect(TRUONG.map((t) => t.name)).toEqual([
      "goal",
      "acceptance",
      "constraints",
      "out_of_scope",
      "ui_reference",
    ]);
  });
});
