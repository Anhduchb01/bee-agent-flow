import "server-only";

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fsc from "node:fs";
import path from "node:path";

import { ctl } from "./ctl";
import { deriveSessionTitle } from "./derive-title";
import { capPhatDaiCong } from "./ports";
import { docUsageTaiKhoan } from "./quota-read";
import { xetHanMuc } from "./quota-gate";
import { laIdPhien } from "./session-id";
import {
  CAC_MODE_PHIEN,
  CAC_MODEL_PHIEN,
  type BeeSessionMode,
  type BeeSessionModel,
} from "./types";

/**
 * Điều khiển phiên: mở / nói vào / dừng / chuyển chế độ. Trong mô hình A+
 * web cùng UID với phiên, nên "vượt ranh giới" chỉ còn là một lệnh
 * `systemctl --user` và một lần ghi FIFO — không cầu, không broker.
 *
 * Kỷ luật giữ nguyên: MỌI giá trị đi vào tên unit / đường dẫn qua allowlist
 * regex trước (spec session-first §9); thất bại là dữ liệu trả về, không
 * phải exception ném lên UI.
 */

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

/** Dải cổng các phiên KHÁC đang giữ — kể cả khi compose của chúng chưa lên. */
async function daiCongDangGiu(): Promise<number[]> {
  const thuMuc = path.join(root(), "sessions");
  let ids: string[] = [];
  try {
    ids = await fs.readdir(thuMuc);
  } catch {
    return [];
  }
  const ra: number[] = [];
  await Promise.all(
    ids.map(async (id) => {
      try {
        const raw = JSON.parse(
          await fs.readFile(path.join(thuMuc, id, "session.json"), "utf8"),
        ) as Record<string, unknown>;
        if (typeof raw.port_base === "number") ra.push(raw.port_base);
      } catch {
        // session.json thiếu/hỏng — không giữ chỗ nào.
      }
    }),
  );
  return ra;
}

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
  /** Permission mode (V2.5a) — mặc định "auto". Phiên chat bỏ qua (không tool). */
  mode?: BeeSessionMode;
  systemPrompt?: string;
}): Promise<KetQuaPhien> {
  if (!SLUG_RE.test(input.slug)) return { ok: false, message: "Invalid project slug." };
  // Phiên chat không repo: repo rỗng là hợp lệ. Phiên có worktree thì repo
  // bắt buộc đúng dạng — và action đã kiểm nó thuộc danh sách đã đăng ký.
  if (input.worktree && !REPO_RE.test(input.repo)) {
    return { ok: false, message: "Invalid repository (owner/name)." };
  }
  if (!Number.isInteger(input.num) || input.num < 1) return { ok: false, message: "Invalid number." };
  const mode: BeeSessionMode = input.mode ?? "auto";
  if (!CAC_MODE_PHIEN.includes(mode)) return { ok: false, message: "Invalid session mode." };

  if (laFixture()) return { ok: true, id: PHIEN_DEMO };

  // ── Phanh hạn mức (FR-3.3) ────────────────────────────────────────────
  // MỘT chỗ duy nhất, và cố ý đặt ở đây chứ không ở action: hàng đợi đêm
  // (V3.T8) cũng đi qua moPhien, nên đặt ở tầng action là để hở đúng cái
  // đường mà không ai ngồi canh. `Continue` phiên cũ KHÔNG đi qua đây —
  // PRD nói "không mở phiên MỚI", nối lại một hội thoại đang dở thì không.
  const phanh = xetHanMuc(await docUsageTaiKhoan(root()), {
    nguong: Number(process.env.QUOTA_BRAKE_PCT ?? 85),
  });
  if (!phanh.moDuoc) {
    return { ok: false, message: `Not opening a new session: ${phanh.lyDo}` };
  }

  // ── Dải cổng riêng cho phiên (V3.T14) ─────────────────────────────────
  // Repo dùng docker compose ghim cổng (`${POSTGRES_PORT:-5432}`), nên hai
  // phiên cùng repo — hoặc một phiên và stack của chính chủ máy — sẽ đụng nhau
  // nếu không cấp dải riêng. Cấp một lần lúc mở; resume dùng lại số đã ghi.
  const cong = input.worktree
    ? await capPhatDaiCong({ daDung: await daiCongDangGiu() })
    : null;

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
      mode,
      system_prompt: input.systemPrompt ?? "",
      max_turns: 120,
      /** Dải 10 cổng của phiên; `null` = phiên chat, không cần. */
      port_base: cong,
      created_at: new Date().toISOString(),
    };
    // tmp + rename: runner đọc file này — không ai được thấy nửa file.
    const tmp = path.join(sdir, ".session.json.tmp");
    await fs.writeFile(tmp, JSON.stringify(session, null, 2));
    await fs.rename(tmp, path.join(sdir, "session.json"));

    await ctl("systemctl", ["--user", "start", `bee-session@${id}.service`]);
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

/**
 * Mode switch mid-session (V2.5a): write the new mode, then restart the
 * unit ONLY if it is running — session-run resumes the same conversation
 * (`--resume`, proven in rig S0.2) with the new permission flags. A
 * stopped session just gets the new mode for its next start; restart on
 * a dead unit would resurrect it, which is not what a mode change means.
 */
export async function doiModePhien(id: string, mode: BeeSessionMode): Promise<KetQua> {
  if (!laIdPhien(id)) return { ok: false, message: "Invalid session id." };
  if (!CAC_MODE_PHIEN.includes(mode)) return { ok: false, message: "Invalid session mode." };
  if (laFixture()) return { ok: true };

  const file = path.join(root(), "sessions", id, "session.json");
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    if (raw.worktree === false) {
      return { ok: false, message: "Chat sessions have no tools — no mode to switch." };
    }
    raw.mode = mode;
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(raw, null, 2));
    await fs.rename(tmp, file);
  } catch (e) {
    return { ok: false, message: `Could not change mode: ${(e as Error).message}` };
  }

  const unit = `bee-session@${id}.service`;
  try {
    await ctl("systemctl", ["--user", "is-active", unit]);
  } catch {
    return { ok: true }; // not running — mode applies on the next start
  }
  try {
    await ctl("systemctl", ["--user", "restart", unit]);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Mode saved but restart failed: ${(e as Error).message}` };
  }
}

/**
 * Model switch mid-session (V2.7) — same shape as doiModePhien: the value
 * goes into session.json, then the unit restarts and the --resume branch in
 * session-run.sh reattaches the SAME conversation under the new model.
 * Unlike mode, chat sessions may switch too — a model is not a tool.
 */
export async function doiModelPhien(id: string, model: BeeSessionModel): Promise<KetQua> {
  if (!laIdPhien(id)) return { ok: false, message: "Invalid session id." };
  if (!CAC_MODEL_PHIEN.includes(model)) return { ok: false, message: "Invalid model." };
  if (laFixture()) return { ok: true };

  const file = path.join(root(), "sessions", id, "session.json");
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    raw.model = model;
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(raw, null, 2));
    await fs.rename(tmp, file);
  } catch (e) {
    return { ok: false, message: `Could not change model: ${(e as Error).message}` };
  }

  const unit = `bee-session@${id}.service`;
  try {
    await ctl("systemctl", ["--user", "is-active", unit]);
  } catch {
    return { ok: true }; // not running — the model applies on the next start
  }
  try {
    await ctl("systemctl", ["--user", "restart", unit]);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Model saved but restart failed: ${(e as Error).message}` };
  }
}

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Answer a manual-mode permission prompt (V2.5b): write the
 * control_response into the SAME FIFO user messages travel through
 * (rig-05 proved the CLI honors it — allow runs the tool, deny blocks it
 * and lands in result.permission_denials). Ledger discipline mirrors
 * bee_user_say: the bee_approval line is written only AFTER the FIFO
 * accepted the response, so replay never shows an answer that never
 * reached the agent.
 */
export async function traLoiQuyen(
  id: string,
  requestId: string,
  choPhep: boolean,
  /** Original tool input JSON (from the can_use_tool event) — echoed back on allow. */
  inputJson: string,
): Promise<KetQua> {
  if (!laIdPhien(id)) return { ok: false, message: "Invalid session id." };
  if (!REQUEST_ID_RE.test(requestId)) return { ok: false, message: "Invalid request id." };
  if (inputJson.length > 64_000) return { ok: false, message: "Tool input too large." };
  let input: unknown = {};
  if (choPhep) {
    try {
      input = JSON.parse(inputJson);
    } catch {
      return { ok: false, message: "Invalid tool input." };
    }
  }
  if (laFixture()) return { ok: true };

  const response = choPhep
    ? { behavior: "allow", updatedInput: input }
    : { behavior: "deny", message: "Denied by the owner from the bee approval card." };
  const dong =
    JSON.stringify({
      type: "control_response",
      response: { subtype: "success", request_id: requestId, response },
    }) + "\n";
  try {
    const fd = await fs.open(fifoCua(id), fsc.constants.O_WRONLY | fsc.constants.O_NONBLOCK);
    try {
      await fd.write(dong);
    } finally {
      await fd.close();
    }
  } catch {
    return { ok: false, message: "Session is not accepting input — it may have ended." };
  }

  const suKien =
    JSON.stringify({
      type: "bee_approval",
      request_id: requestId,
      behavior: choPhep ? "allow" : "deny",
      ts: new Date().toISOString(),
    }) + "\n";
  await fs.appendFile(path.join(root(), "sessions", id, "run.jsonl"), suKien).catch(() => {});
  return { ok: true };
}

/**
 * Continue a finished/stopped session (V2.6): just start the unit again —
 * session-run's --resume branch reconnects the same conversation. Start is
 * idempotent (already-running = no-op), so no state check beyond the
 * session actually existing.
 */
export async function tiepTucPhien(id: string): Promise<KetQua> {
  if (!laIdPhien(id)) return { ok: false, message: "Invalid session id." };
  if (laFixture()) return { ok: true };
  try {
    await fs.access(path.join(root(), "sessions", id, "session.json"));
  } catch {
    return { ok: false, message: "No such session on this machine." };
  }
  try {
    await ctl("systemctl", ["--user", "start", `bee-session@${id}.service`]);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not continue session: ${(e as Error).message}` };
  }
}

export async function dungPhien(id: string): Promise<KetQua> {
  if (!laIdPhien(id)) return { ok: false, message: "Invalid session id." };
  if (laFixture()) return { ok: true };
  try {
    await ctl("systemctl", ["--user", "stop", `bee-session@${id}.service`]);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not stop session: ${(e as Error).message}` };
  }
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Chat attachment ("+" menu): save a file the user picked into the session
 * worktree under `.bee/uploads/`, and return the worktree-relative path the
 * message will carry — the agent opens it with the Read tool. Phone-first
 * flow: a bug screenshot from the camera roll reaches the agent's disk.
 */
export async function saveUploadToSession(
  id: string,
  name: string,
  data: Uint8Array,
): Promise<{ ok: true; relPath: string } | { ok: false; message: string }> {
  if (!laIdPhien(id)) return { ok: false, message: "Invalid session id." };
  if (data.byteLength === 0) return { ok: false, message: "Empty file." };
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "File too large (max 20MB)." };
  }
  // The timestamp prefix makes the stored name unique AND traversal-proof:
  // whatever survives of the original name can never start with "." or "/".
  // slice(-80) keeps the tail so the extension survives long names.
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "file";
  const file = `${Date.now()}-${safe}`;
  const relPath = `.bee/uploads/${file}`;
  if (laFixture()) return { ok: true, relPath };

  const wt = path.join(root(), "work", id);
  try {
    await fs.access(wt);
  } catch {
    return { ok: false, message: "This session has no worktree to attach files to." };
  }
  try {
    const dir = path.join(wt, ".bee", "uploads");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, file), data);
  } catch {
    return { ok: false, message: "Could not save the file." };
  }
  return { ok: true, relPath };
}

