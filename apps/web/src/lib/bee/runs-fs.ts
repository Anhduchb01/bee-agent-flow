import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { resolveEvidencePath } from "./evidence-path";
import type { BeeRun, BeeRunDetail, BeeRunStep } from "./types";

/**
 * Đọc `/srv/bee/runs/<repo>/<số>/<id>-<lúc>/` — chi tiết từng lần agent chạy.
 *
 * Dùng lại `resolveEvidencePath`: cùng một hàm chặn path traversal, cùng danh
 * sách CHO PHÉP `[A-Za-z0-9._-]`. Hai gốc khác nhau nhưng cùng một rủi ro, và
 * một hàm chặn được test kỹ tốt hơn hai hàm mỗi cái test một nửa.
 */

async function docThuMuc(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).sort().reverse(); // mới nhất trước
  } catch {
    return [];
  }
}

async function docJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function metaThanhRun(raw: unknown, dir: string): BeeRun | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string") return null;
  return {
    dir,
    id: m.id,
    repo: typeof m.repo === "string" ? m.repo : "",
    number: typeof m.number === "number" ? m.number : 0,
    rule: typeof m.rule === "string" ? m.rule : "",
    result: typeof m.result === "string" ? m.result : "unknown",
    at: typeof m.at === "string" ? m.at : "",
    turns: typeof m.turns === "number" ? m.turns : 0,
    duration_s: typeof m.duration_s === "number" ? m.duration_s : 0,
    session_id: typeof m.session_id === "string" ? m.session_id : null,
  };
}

export async function listRunsIn(root: string, slug: string, num: number): Promise<BeeRun[]> {
  const base = resolveEvidencePath(root, [slug, String(num)]);
  if (!base) return [];

  const out: BeeRun[] = [];
  for (const dir of await docThuMuc(base)) {
    // Thư mục đang ghi dở mang đuôi `.dang-ghi` — nó chứa dấu chấm nên
    // `resolveEvidencePath` vẫn cho qua, phải loại ở đây. Hiện một lần chạy
    // chưa ghi xong là hiện một bản ghi thiếu file mà không nói vì sao.
    if (dir.endsWith(".dang-ghi")) continue;
    const d = resolveEvidencePath(root, [slug, String(num), dir]);
    if (!d) continue;
    const run = metaThanhRun(await docJson(path.join(d, "meta.json")), dir);
    if (run) out.push(run);
  }
  return out;
}

/**
 * Bóc `run.jsonl` thành các bước đọc được.
 *
 * stream-json mang rất nhiều thứ mà màn hình không dùng: nội dung file đã đọc,
 * tham số tool đầy đủ, token của từng đoạn. Giữ nguyên là vừa nặng vừa lộ
 * những thứ không cần lộ ra trình duyệt — nên chỉ lấy văn bản agent nói và TÊN
 * tool nó gọi.
 */
function bocLog(text: string): BeeRunStep[] {
  const steps: BeeRunStep[] = [];
  for (const dong of text.split("\n")) {
    const t = dong.trim();
    if (!t) continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(t) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (ev.type === "bee_truncated") {
      steps.push({
        kind: "cat",
        text: `Đã bỏ ${String(ev.dropped ?? "?")} dòng đầu, giữ ${String(ev.kept ?? "?")} dòng cuối.`,
      });
      continue;
    }

    if (ev.type === "assistant") {
      const msg = ev.message as { content?: unknown } | undefined;
      const noi = Array.isArray(msg?.content) ? msg.content : [];
      for (const c of noi as Array<Record<string, unknown>>) {
        if (c.type === "text" && typeof c.text === "string" && c.text.trim()) {
          steps.push({ kind: "noi", text: c.text });
        } else if (c.type === "tool_use" && typeof c.name === "string") {
          steps.push({ kind: "tool", text: c.name });
        }
      }
    }
  }
  return steps;
}

export async function readRunIn(
  root: string,
  slug: string,
  num: number,
  dir: string,
): Promise<BeeRunDetail | null> {
  if (dir.endsWith(".dang-ghi")) return null;
  const d = resolveEvidencePath(root, [slug, String(num), dir]);
  if (!d) return null;

  const run = metaThanhRun(await docJson(path.join(d, "meta.json")), dir);
  if (!run) return null;

  const doc = async (ten: string) => {
    try {
      return await fs.readFile(path.join(d, ten), "utf8");
    } catch {
      return "";
    }
  };

  const log = await doc("run.jsonl");
  return {
    ...run,
    output: await doc("output.txt"),
    steps: bocLog(log),
    usage: (await docJson(path.join(d, "usage.json"))) as BeeRunDetail["usage"],
  };
}
