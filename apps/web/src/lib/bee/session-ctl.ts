import "server-only";

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fsc from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { deriveSessionTitle } from "./derive-title";
import { laIdPhien } from "./session-id";

/**
 * Điều khiển phiên: mở / nói vào / dừng / chuyển chế độ. Trong mô hình A+
 * web cùng UID với phiên, nên "vượt ranh giới" chỉ còn là một lệnh
 * `systemctl --user` và một lần ghi FIFO — không cầu, không broker.
 *
 * Kỷ luật giữ nguyên: MỌI giá trị đi vào tên unit / đường dẫn qua allowlist
 * regex trước (spec session-first §9); thất bại là dữ liệu trả về, không
 * phải exception ném lên UI.
 */

const run = promisify(execFile);

export type KetQuaPhien = { ok: true; id: string } | { ok: false; message: string };
export type KetQua = { ok: true } | { ok: false; message: string };

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

function fifoCua(id: string): string {
  const rt = process.env.BEE_RUNTIME ?? path.join(process.env.XDG_RUNTIME_DIR ?? "/run/user/1000", "bee");
  return path.join(rt, `${id}.in`);
}

function laFixture(): boolean {
  return process.env.BEE_SOURCE !== "disk";
}

/** Id phiên demo của fixture — trang live có cái để stream mà không cần máy thật. */
export const PHIEN_DEMO = "de300000-0000-4000-8000-000000000001";

const SLUG_RE = /^[a-z0-9-]+$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export async function moPhien(input: {
  slug: string;
  num: number;
  repo: string;
  /** `null` = untitled — the first chat message will name it (auto-title). */
  title: string | null;
  /** `false` = phiên chat — runner bỏ qua clone/worktree, không bao giờ cấp tool. */
  worktree: boolean;
  systemPrompt?: string;
}): Promise<KetQuaPhien> {
  if (!SLUG_RE.test(input.slug)) return { ok: false, message: "Invalid project slug." };
  // Phiên chat không repo: repo rỗng là hợp lệ. Phiên có worktree thì repo
  // bắt buộc đúng dạng — và action đã kiểm nó thuộc danh sách đã đăng ký.
  if (input.worktree && !REPO_RE.test(input.repo)) {
    return { ok: false, message: "Invalid repository (owner/name)." };
  }
  if (!Number.isInteger(input.num) || input.num < 1) return { ok: false, message: "Invalid number." };

  if (laFixture()) return { ok: true, id: PHIEN_DEMO };

  const id = randomUUID();
  const sdir = path.join(root(), "sessions", id);
  try {
    await fs.mkdir(sdir, { recursive: true });
    const session = {
      id,
      slug: input.slug,
      num: input.num,
      repo: input.repo,
      title: input.title === null ? null : input.title.slice(0, 200),
      // One mode: kept for meta compat, no longer drives anything.
      phase: "work",
      worktree: input.worktree,
      system_prompt: input.systemPrompt ?? "",
      max_turns: 120,
      created_at: new Date().toISOString(),
    };
    // tmp + rename: runner đọc file này — không ai được thấy nửa file.
    const tmp = path.join(sdir, ".session.json.tmp");
    await fs.writeFile(tmp, JSON.stringify(session, null, 2));
    await fs.rename(tmp, path.join(sdir, "session.json"));

    await run("systemctl", ["--user", "start", `bee-session@${id}.service`]);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, message: `Could not start session: ${(e as Error).message}` };
  }
}

/**
 * `hienThi` là bản ghi sổ (mặc định = text): khi "/build args" được expand
 * thành cả trang prompt, lịch sử vẫn hiện đúng cái người dùng GÕ — như
 * REPL của VSCode — còn FIFO nhận bản đầy đủ.
 */
export async function noiVaoPhien(id: string, text: string, hienThi?: string): Promise<KetQua> {
  if (!laIdPhien(id)) return { ok: false, message: "Invalid session id." };
  const gon = text.trim();
  if (gon === "") return { ok: false, message: "Empty message." };
  if (gon.length > 64_000) return { ok: false, message: "Message too long (max 64KB)." };

  if (laFixture()) return { ok: true };

  // Thứ tự cố ý: FIFO trước, ghi sổ sau — bee_user_say chỉ được ghi khi
  // message THẬT SỰ đã vào phiên, không thì lịch sử nói dối.
  const dong =
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: gon }] } }) + "\n";
  try {
    // O_NONBLOCK: FIFO không có người đọc (phiên chết) thì ENXIO ngay lập tức
    // thay vì treo server action vô hạn.
    const fd = await fs.open(fifoCua(id), fsc.constants.O_WRONLY | fsc.constants.O_NONBLOCK);
    try {
      await fd.write(dong);
    } finally {
      await fd.close();
    }
  } catch {
    return { ok: false, message: "Session is not accepting input — it may have ended." };
  }

  // Phát hiện rig S0.1: CLI không echo input ra stream, nên nếu không tự ghi
  // sổ thì mở lại trang là mất sạch những câu đã gõ. Dòng ngắn + O_APPEND
  // là append nguyên tử — an toàn cạnh dòng runner đang ghi.
  const suKien =
    JSON.stringify({ type: "bee_user_say", text: (hienThi ?? text).trim(), ts: new Date().toISOString() }) + "\n";
  await fs.appendFile(path.join(root(), "sessions", id, "run.jsonl"), suKien).catch(() => {});

  // First message names the session, like Claude Code. Best-effort: a
  // naming failure must never fail the send that already went through.
  await autoTitleSession(id, (hienThi ?? text).trim());
  return { ok: true };
}

/**
 * Give an untitled session (title null/empty) a name derived from its first
 * message. No-op when a title already exists or the meta file is unreadable.
 */
export async function autoTitleSession(id: string, text: string): Promise<void> {
  if (!laIdPhien(id)) return;
  const file = path.join(root(), "sessions", id, "session.json");
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    if (typeof raw.title === "string" && raw.title.trim() !== "") return;
    raw.title = deriveSessionTitle(text);
    // Same tmp + rename discipline as the rest of this file — the runner
    // reads session.json and must never see half a file.
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(raw, null, 2));
    await fs.rename(tmp, file);
  } catch {
    // Missing/corrupt meta: skip naming, keep the session usable.
  }
}

export async function dungPhien(id: string): Promise<KetQua> {
  if (!laIdPhien(id)) return { ok: false, message: "Invalid session id." };
  if (laFixture()) return { ok: true };
  try {
    await run("systemctl", ["--user", "stop", `bee-session@${id}.service`]);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not stop session: ${(e as Error).message}` };
  }
}

