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

  it("bee_artifact hợp lệ thành node liệu — kind và url qua allowlist, mang cả title", () => {
    const ket = phanTichDong(
      '{"type":"bee_artifact","kind":"pr","url":"https://github.com/you/myapp/pull/123","number":123,"ts":"2026-08-17T12:00:00Z","title":"Extract layout"}',
    );
    expect(ket).toEqual([
      {
        loai: "artifact",
        kind: "pr",
        url: "https://github.com/you/myapp/pull/123",
        number: 123,
        title: "Extract layout",
      },
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

  it("tool Edit giữ old/new string cho khối diff đỏ/xanh", () => {
    const dong = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "toolu_9",
            name: "Edit",
            input: { file_path: "src/a.ts", old_string: "cũ 1\ncũ 2", new_string: "mới 1" },
          },
        ],
      },
    });
    const ket = phanTichDong(dong);
    expect(ket).toEqual([
      expect.objectContaining({
        loai: "tool",
        ten: "Edit",
        file: "src/a.ts",
        cu: "cũ 1\ncũ 2",
        moi: "mới 1",
      }),
    ]);
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
      // nguCanh 4%: real modelUsage from the recorded stream — the number
      // behind the context ring, plus the raw tokens it derives from.
      {
        loai: "ket-qua",
        loi: false,
        luot: 2,
        nguCanh: 4,
        dungToken: 41752,
        cuaSoToken: 1_000_000,
      },
    ]);
  });
});

describe("manual-mode approvals (V2.5b, shapes from rig-05)", () => {
  it("control_request/can_use_tool becomes an approval event; other subtypes are dropped", () => {
    const dong = JSON.stringify({
      type: "control_request",
      request_id: "d72b0535-401f-4f41-92e3-78a8bfe6ceac",
      request: {
        subtype: "can_use_tool",
        tool_name: "Bash",
        input: { command: "cat /proc/sys/kernel/random/uuid" },
      },
    });
    const { suKien } = gopSuKien([dong]);
    expect(suKien).toEqual([
      {
        loai: "xin-quyen",
        requestId: "d72b0535-401f-4f41-92e3-78a8bfe6ceac",
        ten: "Bash",
        thamSo: JSON.stringify({ command: "cat /proc/sys/kernel/random/uuid" }),
      },
    ]);

    const init = JSON.stringify({
      type: "control_request",
      request_id: "x",
      request: { subtype: "initialize" },
    });
    expect(gopSuKien([init]).suKien).toEqual([]);
  });

  it("bee_approval (web-written ledger line) becomes the answered event", () => {
    const dong = JSON.stringify({
      type: "bee_approval",
      request_id: "abc-1",
      behavior: "deny",
      ts: "t",
    });
    expect(gopSuKien([dong]).suKien).toEqual([
      { loai: "quyen-da-tra-loi", requestId: "abc-1", choPhep: false },
    ]);
  });
});

describe("system/compact_boundary — the CLI compacted the conversation", () => {
  it("becomes a compact event carrying trigger and pre_tokens", () => {
    const dong = JSON.stringify({
      type: "system",
      subtype: "compact_boundary",
      compact_metadata: { trigger: "auto", pre_tokens: 165_000 },
    });
    expect(phanTichDong(dong)).toEqual([
      { loai: "compact", trigger: "auto", preTokens: 165_000 },
    ]);
  });

  it("manual trigger survives; missing metadata degrades, not crashes", () => {
    const dong = JSON.stringify({ type: "system", subtype: "compact_boundary" });
    expect(phanTichDong(dong)).toEqual([{ loai: "compact", trigger: "auto", preTokens: null }]);
    const manual = JSON.stringify({
      type: "system",
      subtype: "compact_boundary",
      compact_metadata: { trigger: "manual", pre_tokens: 90_000 },
    });
    expect(phanTichDong(manual)).toEqual([
      { loai: "compact", trigger: "manual", preTokens: 90_000 },
    ]);
  });

  it("other system subtypes stay silent (whitelist principle)", () => {
    expect(phanTichDong('{"type":"system","subtype":"init"}')).toEqual([]);
    expect(phanTichDong('{"type":"system","subtype":"thinking_tokens"}')).toEqual([]);
  });
});
