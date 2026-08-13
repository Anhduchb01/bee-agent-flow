import { describe, expect, it } from "vitest";

import { parseRecentLine, parseStatus } from "./parse";
import { SCENE_IDS, sceneJson } from "@/lib/fixtures/bee";

describe("parseStatus", () => {
  it.each(SCENE_IDS)("chấp nhận cảnh fixture %s", (id) => {
    const read = parseStatus(sceneJson(id));

    expect(read.ok).toBe(true);
    if (!read.ok) return;

    // Từng trường dưới đây là một trường status_write() thực sự ghi ra. Nếu
    // reconciler đổi hình dạng, test này là chỗ phát hiện — không phải màn hình.
    expect(read.status.heartbeat).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(["running", "paused"]).toContain(read.status.mode);
    expect(read.status.slots.build.max).toBeTypeOf("number");
    expect(read.status.slots.build.per_repo_max).toBeTypeOf("number");
    expect(read.status.slots.evidence.max).toBeTypeOf("number");
    expect(Array.isArray(read.status.running)).toBe(true);
    expect(Array.isArray(read.status.repos)).toBe(true);
  });

  it("giữ nguyên mọi trường của một mục đang chạy", () => {
    const read = parseStatus(sceneJson("binh-thuong"));
    if (!read.ok) throw new Error("cảnh binh-thuong phải parse được");

    expect(read.status.running[0]).toEqual({
      id: "myapp-42",
      repo: "myapp",
      number: 42,
      rule: "07-build",
      pool: "build",
      started_at: expect.any(String),
      elapsed_s: 712,
    });
  });

  it("giữ nguyên mọi trường của một repo", () => {
    const read = parseStatus(sceneJson("day-tai"));
    if (!read.ok) throw new Error("cảnh day-tai phải parse được");

    const myapp = read.status.repos.find((r) => r.slug === "myapp");
    expect(myapp).toBeDefined();
    expect(myapp?.full).toBe("org/myapp");
    expect(myapp?.enabled).toBe(true);
    expect(myapp?.paused).toBe(false);
    expect(myapp?.running).toBe(2);
    expect(myapp?.wip.max).toBe(3);
    expect(myapp?.queue[0]).toEqual({
      repo: "myapp",
      number: 44,
      rule: "07-build",
      title: "Export CSV",
      wait_reason: "repo đã dùng 2/2 slot",
    });
    expect(myapp?.recent[0].result).toBe("ok");
    expect(myapp?.recent[0].duration_s).toBe(403);
  });

  // Ba trường hợp dưới đây là lý do parseStatus tồn tại. status.json do một
  // chương trình bash khác viết ra; app không được sập vì nó.
  it("báo malformed khi JSON hỏng, không ném lỗi", () => {
    const read = parseStatus("{ heartbeat: nope");

    expect(read).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("báo malformed khi thiếu trường bắt buộc", () => {
    const read = parseStatus(JSON.stringify({ mode: "running" }));

    expect(read).toMatchObject({ ok: false, reason: "malformed" });
    if (read.ok) return;
    expect(read.detail).toContain("heartbeat");
  });

  it("báo malformed khi một trường sai kiểu", () => {
    const good = JSON.parse(sceneJson("binh-thuong"));
    good.slots.build.used = "một";

    expect(parseStatus(JSON.stringify(good))).toMatchObject({ ok: false });
  });

  it("bỏ qua mục lạ trong repos thay vì sập cả trang", () => {
    const good = JSON.parse(sceneJson("binh-thuong"));
    good.repos.push({ slug: "hỏng" });

    const read = parseStatus(JSON.stringify(good));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.status.repos).toHaveLength(2);
    expect(read.dropped).toBe(1);
  });
});

describe("parseRecentLine", () => {
  it("đọc đúng một dòng recent.jsonl", () => {
    const line = JSON.stringify({
      id: "myapp-39",
      repo: "myapp",
      number: 39,
      rule: "04-evidence",
      result: "ok",
      turns: 12,
      duration_s: 403,
      at: "2026-08-12T09:14:03Z",
    });

    expect(parseRecentLine(line)).toEqual({
      id: "myapp-39",
      repo: "myapp",
      number: 39,
      rule: "04-evidence",
      result: "ok",
      turns: 12,
      duration_s: 403,
      at: "2026-08-12T09:14:03Z",
    });
  });

  it("trả null cho dòng rác thay vì ném lỗi", () => {
    expect(parseRecentLine("")).toBeNull();
    expect(parseRecentLine("{nope")).toBeNull();
    expect(parseRecentLine(JSON.stringify({ id: "x" }))).toBeNull();
  });
});
