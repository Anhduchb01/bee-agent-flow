import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { mergeEvents, parseLine } from "./parse-events";

// Fixture là stream-json THẬT ghi lại từ rig S0 (apps/runner/rig/FINDINGS.md),
// không phải bịa — hình dạng stream đổi theo phiên bản CLI, và bộ này là hợp
// đồng với phiên bản đã kiểm chứng (claude 2.1.161).
// cwd của vitest là apps/web — cùng cách EVIDENCE_ROOT trong lib/bee/fixture.ts.
function readFixture(name: string): string[] {
  const file = path.join(process.cwd(), "src", "features", "sessions", "lib", "fixtures", name);
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((d) => d.trim() !== "");
}

describe("parseLine", () => {
  it("dòng không phải JSON trả null — người gọi đếm rác, không throw", () => {
    expect(parseLine("node:1234 warning: something")).toBeNull();
  });

  it("bee_lifecycle thành sự kiện vòng đời đọc được", () => {
    const outcome = parseLine('{"type":"bee_lifecycle","msg":"Đang dựng worktree…","ts":"2026-08-17T10:00:00Z"}');
    expect(outcome).toEqual([{ loai: "lifecycle", text: "Đang dựng worktree…", ts: "2026-08-17T10:00:00Z" }]);
  });

  it("bee_user_say thành lời của người — CLI không echo input nên đây là nguồn duy nhất", () => {
    const outcome = parseLine('{"type":"bee_user_say","text":"làm gọn thôi","ts":"2026-08-17T10:01:00Z"}');
    expect(outcome).toEqual([{ loai: "nguoi-noi", text: "làm gọn thôi", ts: "2026-08-17T10:01:00Z" }]);
  });

  it("bee_replayed nói rõ đã bỏ qua bao nhiêu", () => {
    expect(parseLine('{"type":"bee_replayed","skipped":120}')).toEqual([{ loai: "replay", skipped: 120 }]);
  });

  it("bee_artifact hợp lệ thành node liệu — kind và url qua allowlist, mang cả title", () => {
    const outcome = parseLine(
      '{"type":"bee_artifact","kind":"pr","url":"https://github.com/you/myapp/pull/123","number":123,"ts":"2026-08-17T12:00:00Z","title":"Extract layout"}',
    );
    expect(outcome).toEqual([
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
      parseLine('{"type":"bee_artifact","kind":"pr","url":"javascript:alert(1)","number":1}'),
    ).toEqual([]);
    expect(
      parseLine('{"type":"bee_artifact","kind":"gist","url":"https://github.com/x/y","number":1}'),
    ).toEqual([]);
  });

  it("tool Edit giữ old/new string cho khối diff đỏ/xanh", () => {
    const line = JSON.stringify({
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
    const outcome = parseLine(line);
    expect(outcome).toEqual([
      expect.objectContaining({
        loai: "tool",
        name: "Edit",
        file: "src/a.ts",
        cu: "cũ 1\ncũ 2",
        latest: "mới 1",
      }),
    ]);
  });

  it("loại không biết thì bỏ qua êm (mảng rỗng), không phải rác", () => {
    expect(parseLine('{"type":"rate_limit_event","x":1}')).toEqual([]);
    expect(parseLine('{"type":"system","subtype":"hook_started"}')).toEqual([]);
  });
});

describe("mergeEvents trên fixture thật", () => {
  it("fixture gõ-chen: thấy tool Bash, kết quả tool, và câu trả lời có mã hiệu", () => {
    const { events, junkLines } = mergeEvents(readFixture("fixture-interject.jsonl"));
    expect(junkLines).toBe(0);

    const tool = events.filter((s) => s.loai === "tool");
    expect(tool.some((t) => t.loai === "tool" && t.name === "Bash")).toBe(true);

    expect(events.some((s) => s.loai === "tool-xong" && s.text.includes("xong"))).toBe(true);
    expect(events.some((s) => s.loai === "agent-noi" && s.text.includes("XOAI-XANH"))).toBe(true);
  });

  it("fixture gõ-chen: có delta chữ để màn hình chạy mượt", () => {
    const { events } = mergeEvents(readFixture("fixture-interject.jsonl"));
    expect(events.some((s) => s.loai === "delta")).toBe(true);
  });

  it("fixture phiên trọn vẹn: có tool Write và một kết-quả không lỗi", () => {
    const { events, junkLines } = mergeEvents(readFixture("fixture-resume-work.jsonl"));
    expect(junkLines).toBe(0);
    expect(events.some((s) => s.loai === "tool" && s.name === "Write")).toBe(true);
    expect(events.filter((s) => s.loai === "ket-qua")).toEqual([
      // nguCanh 4%: real modelUsage from the recorded stream — the number
      // behind the context ring, plus the raw tokens it derives from.
      {
        loai: "ket-qua",
        err: false,
        luot: 2,
        nguCanh: 4,
        validToken: 41752,
        cuaSoToken: 1_000_000,
      },
    ]);
  });
});

describe("manual-mode approvals (V2.5b, shapes from rig-05)", () => {
  it("control_request/can_use_tool becomes an approval event; other subtypes are dropped", () => {
    const line = JSON.stringify({
      type: "control_request",
      request_id: "d72b0535-401f-4f41-92e3-78a8bfe6ceac",
      request: {
        subtype: "can_use_tool",
        tool_name: "Bash",
        input: { command: "cat /proc/sys/kernel/random/uuid" },
      },
    });
    const { events } = mergeEvents([line]);
    expect(events).toEqual([
      {
        loai: "xin-quyen",
        requestId: "d72b0535-401f-4f41-92e3-78a8bfe6ceac",
        name: "Bash",
        thamSo: JSON.stringify({ command: "cat /proc/sys/kernel/random/uuid" }),
      },
    ]);

    const init = JSON.stringify({
      type: "control_request",
      request_id: "x",
      request: { subtype: "initialize" },
    });
    expect(mergeEvents([init]).events).toEqual([]);
  });

  it("bee_approval (web-written ledger line) becomes the answered event", () => {
    const line = JSON.stringify({
      type: "bee_approval",
      request_id: "abc-1",
      behavior: "deny",
      ts: "t",
    });
    expect(mergeEvents([line]).events).toEqual([
      { loai: "quyen-da-tra-loi", requestId: "abc-1", allow: false },
    ]);
  });
});

describe("system/compact_boundary — the CLI compacted the conversation", () => {
  it("becomes a compact event carrying trigger and pre_tokens", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "compact_boundary",
      compact_metadata: { trigger: "auto", pre_tokens: 165_000 },
    });
    expect(parseLine(line)).toEqual([
      { loai: "compact", trigger: "auto", preTokens: 165_000 },
    ]);
  });

  it("manual trigger survives; missing metadata degrades, not crashes", () => {
    const line = JSON.stringify({ type: "system", subtype: "compact_boundary" });
    expect(parseLine(line)).toEqual([{ loai: "compact", trigger: "auto", preTokens: null }]);
    const manual = JSON.stringify({
      type: "system",
      subtype: "compact_boundary",
      compact_metadata: { trigger: "manual", pre_tokens: 90_000 },
    });
    expect(parseLine(manual)).toEqual([
      { loai: "compact", trigger: "manual", preTokens: 90_000 },
    ]);
  });

  it("other system subtypes stay silent (whitelist principle)", () => {
    expect(parseLine('{"type":"system","subtype":"init"}')).toEqual([]);
    expect(parseLine('{"type":"system","subtype":"thinking_tokens"}')).toEqual([]);
  });
});

describe("bee_truncated — log bị cắt là chuyện KHÁC replay", () => {
  it("thành sự kiện riêng, mang số dòng đã mất", () => {
    expect(parseLine('{"type":"bee_truncated","skipped":1200,"ts":"t"}')).toEqual([
      { loai: "da-cat", skipped: 1200 },
    ]);
  });

  it("không bị nhầm thành replay — một cái là mất dữ liệu, một cái chỉ là vào muộn", () => {
    expect(parseLine('{"type":"bee_replayed","skipped":5}')).toEqual([
      { loai: "replay", skipped: 5 },
    ]);
  });
});
