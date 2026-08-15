import { describe, expect, it } from "vitest";

import { bocKhoiTask, timKhoiTask } from "./parse-task-block";

const DAY_DU = `# Thêm bộ lọc trạng thái vào danh sách đơn

### Goal

PM lọc nhanh đơn đang chờ xử lý mà không phải cuộn cả trang.

### Acceptance Criteria

- [ ] Given danh sách có 3 trạng thái, when chọn "Đang chờ", then chỉ đơn đang chờ hiện ra
- [ ] Given đã lọc, when tải lại trang, then bộ lọc vẫn giữ

### Technical constraints

to be confirmed by the spec gatekeeper: bộ lọc hiện tại nằm ở đâu.

### Out of scope

Không đụng tới phân trang, không thêm lọc theo ngày.

### UI Reference

no UI in this task`;

describe("timKhoiTask", () => {
  it("không có khối nào thì trả null", () => {
    expect(timKhoiTask("Q: bạn muốn gì?\nGUESS: …")).toBeNull();
  });

  it("bóc được khối giữa đoạn văn", () => {
    const s = `Được rồi, đây là bản nháp:\n\n\`\`\`task\n${DAY_DU}\n\`\`\`\n`;
    expect(timKhoiTask(s)).toContain("### Goal");
  });

  /*
   * Người dùng xin sửa thì model in ra một khối MỚI trọn vẹn (prompt cấm in
   * diff). Lấy khối đầu là âm thầm tạo task theo bản đã bị bác bỏ — sai theo
   * kiểu không ai phát hiện ra cho tới khi đọc issue.
   */
  it("nhiều khối thì lấy khối cuối", () => {
    const s = `\`\`\`task\n# Bản cũ\n\`\`\`\nsửa lại nhé\n\`\`\`task\n# Bản mới\n\`\`\``;
    expect(timKhoiTask(s)).toContain("Bản mới");
    expect(timKhoiTask(s)).not.toContain("Bản cũ");
  });
});

describe("bocKhoiTask", () => {
  it("khối đủ năm mục", () => {
    const r = bocKhoiTask(DAY_DU);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.task.title).toBe("Thêm bộ lọc trạng thái vào danh sách đơn");
    expect(r.task.goal).toContain("PM lọc nhanh");
    expect(r.task.acceptance).toContain("- [ ] Given");
    expect(r.task.out_of_scope).toContain("phân trang");
    expect(r.task.ui_reference).toBe("no UI in this task");
  });

  // Mục rỗng vẫn tạo được issue, và đó là hợp đồng rỗng mà rule 08 trả lại sau
  // khi đã tốn một vòng. Nói ra mục nào thiếu thì rẻ hơn nhiều.
  it("thiếu mục nào thì gọi tên mục đó", () => {
    const r = bocKhoiTask(DAY_DU.replace(/### Out of scope[\s\S]*?(?=### UI)/, ""));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.thieu).toEqual(["Out of scope"]);
  });

  it("thiếu tiêu đề cũng bị bắt", () => {
    const r = bocKhoiTask(DAY_DU.replace(/^# .*$/m, ""));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.thieu).toContain("Title");
  });

  // `###` cũng khớp `^#` nếu regex viết ẩu, và lúc đó tiêu đề thành "# Goal".
  it("không nhầm `###` thành tiêu đề", () => {
    const r = bocKhoiTask(DAY_DU.replace(/^# .*$/m, "### Goal\n\nx"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.thieu).toContain("Title");
  });

  // Bám vào thứ tự là tự tạo thêm một cách hỏng im lặng.
  it("đảo thứ tự các mục vẫn bóc đúng", () => {
    const dao = [
      "# Tiêu đề",
      "### UI Reference\n\nkhông có UI",
      "### Goal\n\nmục tiêu",
      "### Out of scope\n\nkhông đụng gì",
      "### Acceptance Criteria\n\n- [ ] Given a, when b, then c",
      "### Technical constraints\n\nràng buộc",
    ].join("\n\n");
    const r = bocKhoiTask(dao);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.task.goal).toBe("mục tiêu");
    expect(r.task.ui_reference).toBe("không có UI");
  });
});
