import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listRunsIn, readRunIn } from "./runs-fs";

let goc: string;

async function dungRun(dir: string, meta: object, files: Record<string, string> = {}) {
  const d = path.join(goc, "myapp", "40", dir);
  await fs.mkdir(d, { recursive: true });
  await fs.writeFile(path.join(d, "meta.json"), JSON.stringify(meta));
  for (const [ten, noi] of Object.entries(files)) {
    await fs.writeFile(path.join(d, ten), noi);
  }
}

const META = {
  id: "myapp-40",
  repo: "myapp",
  number: 40,
  rule: "07-build",
  result: "ok",
  at: "2026-08-13T09:12:00Z",
  turns: 9,
  duration_s: 264,
  session_id: "sess-abc",
};

beforeAll(async () => {
  goc = await fs.mkdtemp(path.join(os.tmpdir(), "bee-runs-"));
  await dungRun("myapp-40-20260813T091200Z", META, {
    "output.txt": "**Done** — xong rồi",
    "run.jsonl": [
      JSON.stringify({ type: "system", subtype: "init", cwd: "/srv/bee/work/myapp-40" }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Tôi sẽ tách component." }] },
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "/bi/mat" } }] },
      }),
      JSON.stringify({ type: "result", result: "xong", session_id: "sess-abc" }),
    ].join("\n"),
    "usage.json": JSON.stringify({ tokens_in: 100, cost_usd: 0.42 }),
  });
  await dungRun("myapp-40-20260813T080000Z", { ...META, result: "fail", at: "2026-08-13T08:00:00Z" });
});

afterAll(async () => {
  await fs.rm(goc, { recursive: true, force: true });
});

describe("listRunsIn", () => {
  it("mới nhất trước — thứ tự đọc của con người", async () => {
    const ds = await listRunsIn(goc, "myapp", 40);
    expect(ds.map((r) => r.at)).toEqual(["2026-08-13T09:12:00Z", "2026-08-13T08:00:00Z"]);
  });

  it("task chưa chạy lần nào thì rỗng, không ném", async () => {
    expect(await listRunsIn(goc, "myapp", 99)).toEqual([]);
    expect(await listRunsIn(goc, "khong-co", 1)).toEqual([]);
  });

  /*
   * `run_archive` dựng ở `<đích>.dang-ghi` rồi mới `mv`. Bắt gặp đúng lúc đó mà
   * hiện ra là hiện một lần chạy thiếu file, và người xem không có cách nào
   * biết vì sao nó trống.
   */
  it("bỏ qua thư mục đang ghi dở", async () => {
    await dungRun("myapp-40-20260813T100000Z.dang-ghi", META);
    const ds = await listRunsIn(goc, "myapp", 40);
    expect(ds.some((r) => r.dir.endsWith(".dang-ghi"))).toBe(false);
    expect(await readRunIn(goc, "myapp", 40, "myapp-40-20260813T100000Z.dang-ghi")).toBeNull();
  });

  // Cùng hàm chặn với route bằng chứng, nên bài test kia cũng bảo vệ chỗ này —
  // nhưng gốc khác nhau, và một `..` lọt ở đây đọc được cả /etc/bee.
  it("chặn đường thoát ra ngoài gốc", async () => {
    expect(await listRunsIn(goc, "..", 40)).toEqual([]);
    expect(await readRunIn(goc, "myapp", 40, "../../etc")).toBeNull();
  });
});

describe("readRunIn", () => {
  it("bóc log thành các bước đọc được", async () => {
    const r = await readRunIn(goc, "myapp", 40, "myapp-40-20260813T091200Z");
    expect(r).not.toBeNull();
    expect(r?.output).toContain("xong rồi");
    expect(r?.usage?.cost_usd).toBe(0.42);
    expect(r?.steps).toEqual([
      { kind: "noi", text: "Tôi sẽ tách component." },
      { kind: "tool", text: "Write" },
    ]);
  });

  /*
   * Chỉ giữ TÊN tool, không giữ tham số. `input` của một lần Write mang cả nội
   * dung file; đẩy nguyên ra trình duyệt là vừa nặng vừa lộ thứ không cần lộ.
   */
  it("không mang tham số của tool ra ngoài", async () => {
    const r = await readRunIn(goc, "myapp", 40, "myapp-40-20260813T091200Z");
    expect(JSON.stringify(r?.steps)).not.toContain("/bi/mat");
  });

  it("log bị cắt thì nói ra là đã cắt", async () => {
    await dungRun("myapp-40-20260812T000000Z", META, {
      "run.jsonl": JSON.stringify({ type: "bee_truncated", dropped: 90, kept: 10 }),
    });
    const r = await readRunIn(goc, "myapp", 40, "myapp-40-20260812T000000Z");
    expect(r?.steps[0]).toEqual({ kind: "cat", text: "Đã bỏ 90 dòng đầu, giữ 10 dòng cuối." });
  });

  it("thiếu file phụ thì vẫn đọc được phần meta", async () => {
    const r = await readRunIn(goc, "myapp", 40, "myapp-40-20260813T080000Z");
    expect(r?.result).toBe("fail");
    expect(r?.output).toBe("");
    expect(r?.steps).toEqual([]);
    expect(r?.usage).toBeNull();
  });
});
