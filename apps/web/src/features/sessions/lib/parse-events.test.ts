import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { gopSuKien, phanTichDong } from "./parse-events";

// Fixture là stream-json THẬT ghi lại từ rig S0 (apps/runner/rig/FINDINGS.md),
// không phải bịa — hình dạng stream đổi theo phiên bản CLI, và bộ này là hợp
// đồng với phiên bản đã kiểm chứng (claude 2.1.161).
// cwd của vitest là apps/web — cùng cách EVIDENCE_ROOT trong lib/bee/fixture.ts.
function docFixture(ten: string): string[] {
  const file = path.join(process.cwd(), "src", "features", "sessions", "lib", "fixtures", ten);
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((d) => d.trim() !== "");
}

describe("phanTichDong", () => {
  it("dòng không phải JSON trả null — người gọi đếm rác, không throw", () => {
    expect(phanTichDong("node:1234 warning: something")).toBeNull();
  });

  it("bee_lifecycle thành sự kiện vòng đời đọc được", () => {
    const ket = phanTichDong('{"type":"bee_lifecycle","msg":"Đang dựng worktree…","ts":"2026-08-17T10:00:00Z"}');
    expect(ket).toEqual([{ loai: "lifecycle", text: "Đang dựng worktree…", ts: "2026-08-17T10:00:00Z" }]);
  });

  it("bee_user_say thành lời của người — CLI không echo input nên đây là nguồn duy nhất", () => {
    const ket = phanTichDong('{"type":"bee_user_say","text":"làm gọn thôi","ts":"2026-08-17T10:01:00Z"}');
    expect(ket).toEqual([{ loai: "nguoi-noi", text: "làm gọn thôi", ts: "2026-08-17T10:01:00Z" }]);
  });

  it("bee_replayed nói rõ đã bỏ qua bao nhiêu", () => {
    expect(phanTichDong('{"type":"bee_replayed","skipped":120}')).toEqual([{ loai: "replay", boQua: 120 }]);
  });

  it("bee_artifact hợp lệ thành node liệu — kind và url qua allowlist", () => {
    const ket = phanTichDong(
      '{"type":"bee_artifact","kind":"pr","url":"https://github.com/you/myapp/pull/123","number":123,"ts":"2026-08-17T12:00:00Z"}',
    );
    expect(ket).toEqual([
      { loai: "artifact", kind: "pr", url: "https://github.com/you/myapp/pull/123", number: 123 },
    ]);
  });

  it("bee_artifact với url không phải GitHub hoặc kind lạ bị bỏ qua êm", () => {
    expect(
      phanTichDong('{"type":"bee_artifact","kind":"pr","url":"javascript:alert(1)","number":1}'),
    ).toEqual([]);
    expect(
      phanTichDong('{"type":"bee_artifact","kind":"gist","url":"https://github.com/x/y","number":1}'),
    ).toEqual([]);
  });

  it("loại không biết thì bỏ qua êm (mảng rỗng), không phải rác", () => {
    expect(phanTichDong('{"type":"rate_limit_event","x":1}')).toEqual([]);
    expect(phanTichDong('{"type":"system","subtype":"hook_started"}')).toEqual([]);
  });
});

describe("gopSuKien trên fixture thật", () => {
  it("fixture gõ-chen: thấy tool Bash, kết quả tool, và câu trả lời có mã hiệu", () => {
    const { suKien, dongRac } = gopSuKien(docFixture("fixture-interject.jsonl"));
    expect(dongRac).toBe(0);

    const tool = suKien.filter((s) => s.loai === "tool");
    expect(tool.some((t) => t.loai === "tool" && t.ten === "Bash")).toBe(true);

    expect(suKien.some((s) => s.loai === "tool-xong" && s.text.includes("xong"))).toBe(true);
    expect(suKien.some((s) => s.loai === "agent-noi" && s.text.includes("XOAI-XANH"))).toBe(true);
  });

  it("fixture gõ-chen: có delta chữ để màn hình chạy mượt", () => {
    const { suKien } = gopSuKien(docFixture("fixture-interject.jsonl"));
    expect(suKien.some((s) => s.loai === "delta")).toBe(true);
  });

  it("fixture phiên trọn vẹn: có tool Write và một kết-quả không lỗi", () => {
    const { suKien, dongRac } = gopSuKien(docFixture("fixture-resume-work.jsonl"));
    expect(dongRac).toBe(0);
    expect(suKien.some((s) => s.loai === "tool" && s.ten === "Write")).toBe(true);
    expect(suKien.filter((s) => s.loai === "ket-qua")).toEqual([
      { loai: "ket-qua", loi: false, luot: 2 },
    ]);
  });
});
