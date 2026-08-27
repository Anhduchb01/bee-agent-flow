import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { ctl } from "./ctl";

import {
  waitFor,
  closeFlow,
  sendCode,
  oauthError,
  lastScreen,
  openFlow,
  nudgeEnter,
  type PtyFlow,
} from "./pty-flow";
import {
  readSlayerPool,
  isSlotTarget,
  isSlotName,
  isSlayerToken,
  type BeeClaudePool,
} from "./slayer";
import { extractOauthUrl } from "./claude-token";

export type Result = { ok: true } | { ok: false; message: string };
export type LinkResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * Nhiều tài khoản Claude trên bee, đổi qua lại từ điện thoại.
 *
 * Việc nặng do `token-slayer` làm; chỗ này chỉ gọi nó và dịch kết quả sang
 * thứ UI hiển thị được. Hai luật đứng sau mọi hàm dưới đây:
 *
 *  1. Đổi tài khoản là hành động TOÀN MÁY (nó ghi đè
 *     `~/.claude/.credentials.json`), nên phiên đang chạy sẽ trôi sang tài
 *     khoản mới lúc nó làm mới token. Vì vậy `switchSlot` từ chối khi còn
 *     phiên chạy, thay vì đổi rồi để người dùng tự đoán chuyện gì đã xảy ra.
 *  2. `claude.env` (token dán ở /setup) ĐÈ LÊN mọi lựa chọn ở đây, vì
 *     runner export `CLAUDE_CODE_OAUTH_TOKEN` và biến môi trường thắng file
 *     credential. Còn nó thì bảng tài khoản là một lời nói dối lịch sự —
 *     nên ta phát hiện và nói thẳng.
 */

function isFixture(): boolean {
  return process.env.BEE_SOURCE !== "disk";
}

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

/** Đường dẫn `tok`. Unit đã có `~/.local/bin` trong PATH; giữ tên trần cho dễ đọc. */
const TOK = "tok";

const POOL_DEMO: BeeClaudePool = {
  enabled: "work",
  slots: [
    {
      index: 1,
      name: "work",
      alias: null,
      email: "you@company.com",
      state: "active",
      enabled: true,
      namGio: { percentOf: 29, resetLuc: null },
      bayNgay: { percentOf: 36, resetLuc: null },
      hetHan: false,
    },
    {
      index: 2,
      name: "personal",
      alias: null,
      email: "you@gmail.com",
      state: "idle",
      enabled: false,
      namGio: { percentOf: 4, resetLuc: null },
      bayNgay: { percentOf: 11, resetLuc: null },
      hetHan: false,
    },
  ],
};

export interface SlayerStatus {
  /** `tok` có trên máy không. Chưa có thì UI hiện ô dán token để cài. */
  daCai: boolean;
  /**
   * Máy có login tương tác (`~/.claude/.credentials.json`) để mà CHỤP hay
   * không. Không có thì `tok add <tên>` (không `--login`) chắc chắn trượt —
   * bee thường rơi đúng vào ca này vì nó chạy bằng token dán ở /setup, mà
   * token thì không phải một phiên đăng nhập để chụp lại.
   */
  coLoginMay: boolean;
  pool: BeeClaudePool | null;
  /** claude.env đang ghim một token, đè lên slot đang chọn. */
  tokenGhim: boolean;
  /** Vì sao không đọc được pool, khi `tok` có mà vẫn hỏng. */
  message: string | null;
}

async function hasPinnedToken(): Promise<boolean> {
  try {
    const speak = await fs.readFile(path.join(root(), "claude.env"), "utf8");
    return /^CLAUDE_CODE_OAUTH_TOKEN=\S/m.test(speak);
  } catch {
    return false;
  }
}

/** Bảng tài khoản cho /setup. Không ném: hỏng chỗ nào thì nói chỗ đó. */
export async function readSlayerStatus(): Promise<SlayerStatus> {
  if (isFixture()) {
    return { daCai: true, pool: POOL_DEMO, tokenGhim: false, message: null, coLoginMay: true };
  }
  const pinned = await hasPinnedToken();
  const coLogin = await fs
    .access(path.join(process.env.HOME ?? "", ".claude", ".credentials.json"))
    .then(() => true)
    .catch(() => false);
  let ra: { stdout: string };
  try {
    ra = await ctl(TOK, ["list", "--json"], { timeout: 30_000, maxBuffer: 4 << 20 });
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") {
      return { daCai: false, pool: null, tokenGhim: pinned, message: null, coLoginMay: coLogin };
    }
    return {
      daCai: true,
      pool: null,
      tokenGhim: pinned,
      coLoginMay: coLogin,
      message: (err.stderr ?? err.message).slice(0, 200),
    };
  }
  const pool = readSlayerPool(ra.stdout);
  return {
    daCai: true,
    pool,
    tokenGhim: pinned,
    coLoginMay: coLogin,
    message: pool === null ? "`tok list --json` trả về thứ không đọc được." : null,
  };
}

/**
 * Đổi tài khoản đang bật. `runningSessions` do lớp gọi đếm và truyền vào —
 * hàm này không tự đi đọc đĩa, để luật "không đổi khi đang chạy" test được
 * mà không cần dựng cả thư mục phiên.
 */
export async function switchSlot(target: string, runningSessions: number): Promise<Result> {
  const trimmed = target.trim();
  if (!isSlotTarget(trimmed)) return { ok: false, message: "Tên slot không hợp lệ." };
  if (runningSessions > 0) {
    return {
      ok: false,
      message:
        `Còn ${runningSessions} phiên đang chạy. Đổi tài khoản là đổi cho CẢ MÁY, ` +
        "phiên đang chạy sẽ trôi sang tài khoản mới lúc nó làm mới token — dừng chúng trước đã.",
    };
  }
  if (isFixture()) return { ok: true };
  try {
    await ctl(TOK, ["switch", trimmed], { timeout: 60_000 });
    return { ok: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    return { ok: false, message: (err.stderr || err.stdout || err.message).slice(0, 300) };
  }
}

/** Chụp lại tài khoản `claude` đang đăng nhập thành một slot mới. */
export async function captureSlot(name: string): Promise<Result> {
  const trimmed = name.trim();
  if (!isSlotName(trimmed)) {
    return { ok: false, message: "Tên slot chỉ nhận chữ, số, dấu chấm, gạch ngang và gạch dưới." };
  }
  if (isFixture()) return { ok: true };
  try {
    await ctl(TOK, ["add", trimmed], { timeout: 120_000 });
    return { ok: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    return { ok: false, message: (err.stderr || err.stdout || err.message).slice(0, 300) };
  }
}

/*
 * Thêm tài khoản KHÁC: `tok add <tên> --login` in ra URL rồi chờ mã dán
 * vào — cùng hình dạng với `claude setup-token`, nên cùng một tay lái.
 * Một luồng tại một thời điểm; mở luồng mới là bỏ luồng cũ.
 */
let addFlow: PtyFlow | null = null;

function appendLine(): void {
  closeFlow(addFlow);
  addFlow = null;
}

export async function startAddSlot(name: string): Promise<LinkResult> {
  const trimmed = name.trim();
  if (!isSlotName(trimmed)) {
    return { ok: false, message: "Tên slot chỉ nhận chữ, số, dấu chấm, gạch ngang và gạch dưới." };
  }
  if (isFixture()) return { ok: true, url: "https://claude.ai/oauth/authorize?demo=1" };

  appendLine();
  const flow = openFlow(`${TOK} add ${trimmed} --login`);
  addFlow = flow;

  const url = await waitFor(flow, extractOauthUrl);
  if (url !== null) return { ok: true, url };
  const swapWith = lastScreen(flow.out);
  const vi = flow.done ? "luồng thoát trước khi in URL" : "hết giờ chờ URL";
  appendLine();
  return {
    ok: false,
    message: `Không lấy được link — ${vi}.${swapWith === null ? "" : ` Màn hình vừa in: “${swapWith}”`}`,
  };
}

export async function finishAddSlot(code: string): Promise<Result> {
  const trimmed = code.trim();
  if (!/^[A-Za-z0-9#_-]+$/.test(trimmed)) return { ok: false, message: "Đó không giống một mã xác nhận." };
  if (isFixture()) return { ok: true };

  const flow = addFlow;
  if (flow === null || flow.done) {
    appendLine();
    return { ok: false, message: "Không có luồng đăng nhập nào đang chờ — lấy link mới đã." };
  }

  await sendCode(flow, trimmed);
  // `tok` lưu credential rồi mới thoát: kết thúc sạch = xong.
  for (let i = 0; i < 120; i++) {
    if (i === 20) nudgeEnter(flow);
    const refused = oauthError(flow.out);
    if (refused !== null) {
      appendLine();
      return { ok: false, message: `${refused} — lấy link mới rồi thử lại.` };
    }
    if (flow.done) {
      const swapWith = lastScreen(flow.out);
      const code = flow.p.exitCode;
      appendLine();
      if (code === 0) return { ok: true };
      return {
        ok: false,
        message: `tok add thoát với mã ${code ?? "?"}.${swapWith === null ? "" : ` Màn hình vừa in: “${swapWith}”`}`,
      };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const swapWith = lastScreen(flow.out);
  appendLine();
  return {
    ok: false,
    message: `Hết giờ chờ tok add.${swapWith === null ? "" : ` Màn hình vừa in: “${swapWith}”`}`,
  };
}

/**
 * Cài token-slayer bằng token của người dùng.
 *
 * Token đi qua **môi trường**, không qua argv: argv của tiến trình ai trên
 * máy cũng đọc được, còn đây là trình cài đặt của bên thứ ba nên ta không
 * biết nó log gì. URL ghim cứng — một biến để đổi host là biến một ô dán
 * token thành một ô chạy mã tuỳ ý.
 */
const URL_CAI = "https://token-slayer.ownego.com/install";

export async function installSlayer(token: string): Promise<Result> {
  const trimmed = token.trim();
  if (!isSlayerToken(trimmed)) {
    return { ok: false, message: "Token không đúng hình dạng (chuỗi ~47 ký tự chữ/số/-/_)." };
  }
  if (isFixture()) return { ok: true };
  try {
    // `set -o pipefail` để curl hỏng không bị `sh` nuốt thành thành công.
    await ctl(
      "bash",
      ["-o", "pipefail", "-c", `curl -fsSL "${URL_CAI}" | sh`],
      { timeout: 300_000, env: { ...process.env, TOKEN_SLAYER_TOKEN: trimmed }, maxBuffer: 4 << 20 },
    );
    return { ok: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    const speak = (err.stderr || err.stdout || err.message).replaceAll(trimmed, "…");
    return { ok: false, message: speak.slice(-300) };
  }
}

/**
 * `tok setup` — nhận tài khoản admin đã cấp cho token của bạn.
 *
 * Trả về NGUYÊN LỜI của nó, kể cả khi không có gì để nhận: câu
 * *"you are a member but this machine has no credential — ask an admin to
 * Reissue"* chính là câu trả lời cho "sao tôi chưa đăng nhập được", và giấu
 * nó sau một chữ "xong" là lấy mất thứ duy nhất hữu ích.
 */
export async function pullGrantedAccounts(): Promise<Result & { speak?: string }> {
  if (isFixture()) {
    return { ok: true, speak: "Nothing to do. (No provisioned accounts to add or remove.)" };
  }
  try {
    const ra = await ctl(TOK, ["setup"], { timeout: 180_000, maxBuffer: 4 << 20 });
    const speak = `${ra.stdout}${ra.stderr ?? ""}`.trim().split("\n").slice(-4).join("\n");
    return { ok: true, speak: speak === "" ? "tok setup: xong, không nói gì thêm." : speak };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    if (err.code === "ENOENT") return { ok: false, message: "Máy chưa cài token-slayer." };
    return { ok: false, message: (err.stderr || err.stdout || err.message).trim().slice(-300) };
  }
}

/** Gỡ token ghim trong claude.env để lựa chọn tài khoản ở đây có hiệu lực. */
export async function unpinToken(): Promise<Result> {
  if (isFixture()) return { ok: true };
  try {
    await fs.rm(path.join(root(), "claude.env"), { force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Không xoá được claude.env: ${(e as Error).message}` };
  }
}
