import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lietKePhienTrong } from "./sessions-fs";

const ID_A = "aaaaaaaa-1111-4222-8333-444444444444";
const ID_B = "bbbbbbbb-1111-4222-8333-444444444444";
const ID_C = "cccccccc-1111-4222-8333-444444444444";

function dungSan(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "bee-sessions-"));

  // A: đủ cả session.json lẫn meta.json — phiên bình thường
  const a = path.join(root, "sessions", ID_A);
  mkdirSync(a, { recursive: true });
  writeFileSync(
    path.join(a, "session.json"),
    JSON.stringify({ id: ID_A, slug: "myapp", num: 41, repo: "you/myapp", phase: "work", created_at: "2026-08-17T10:00:00Z" }),
  );
  writeFileSync(path.join(a, "meta.json"), JSON.stringify({ status: "running", started_at: "2026-08-17T10:00:04Z" }));

  // B: mới có session.json — khoảnh khắc giữa lúc bấm nút và lúc runner mở sổ
  const b = path.join(root, "sessions", ID_B);
  mkdirSync(b, { recursive: true });
  writeFileSync(
    path.join(b, "session.json"),
    JSON.stringify({ id: ID_B, slug: "blog", num: 7, repo: "you/blog", created_at: "2026-08-17T11:00:00Z" }),
  );

  // C: meta.json hỏng (bash ghi dở) — không được làm trắng cả danh sách
  const c = path.join(root, "sessions", ID_C);
  mkdirSync(c, { recursive: true });
  writeFileSync(
    path.join(c, "session.json"),
    JSON.stringify({ id: ID_C, slug: "myapp", num: 42, repo: "you/myapp", created_at: "2026-08-17T09:00:00Z" }),
  );
  writeFileSync(path.join(c, "meta.json"), '{"status": "runn');

  // Thư mục tên bẩn — phải bị bỏ qua, không phải nổ
  mkdirSync(path.join(root, "sessions", "..danh-lua"), { recursive: true });

  return root;
}

describe("lietKePhienTrong", () => {
  it("đọc đủ ba phiên, mới nhất trước, tên thư mục bẩn bị bỏ qua", async () => {
    const ds = await lietKePhienTrong(dungSan());
    expect(ds.map((p) => p.id)).toEqual([ID_B, ID_A, ID_C]);
  });

  it("chưa có meta.json là 'starting' — trạng thái thật, không phải lỗi", async () => {
    const ds = await lietKePhienTrong(dungSan());
    expect(ds.find((p) => p.id === ID_B)?.status).toBe("starting");
  });

  it("meta.json hỏng thì phiên vẫn hiện, rơi về 'starting'", async () => {
    const ds = await lietKePhienTrong(dungSan());
    expect(ds.find((p) => p.id === ID_C)?.status).toBe("starting");
  });

  it("thư mục sessions chưa tồn tại trả danh sách rỗng", async () => {
    expect(await lietKePhienTrong("/khong/co/that")).toEqual([]);
  });
});
