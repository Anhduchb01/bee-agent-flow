import "server-only";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  cho,
  dongLuong,
  guiMa,
  loiOauth,
  manHinhCuoi,
  moLuong,
  nhacEnter,
  type LuongPty,
} from "./pty-flow";
import {
  docPoolSlayer,
  laMucTieuSlot,
  laTenSlot,
  laTokenSlayer,
  type BeePoolClaude,
} from "./slayer";
import { extractOauthUrl } from "./claude-token";

const run = promisify(execFile);

export type KetQua = { ok: true } | { ok: false; message: string };
export type KetQuaLink = { ok: true; url: string } | { ok: false; message: string };

/**
 * Nhiều tài khoản Claude trên bee, đổi qua lại từ điện thoại.
 *
 * Việc nặng do `token-slayer` làm; chỗ này chỉ gọi nó và dịch kết quả sang
 * thứ UI hiển thị được. Hai luật đứng sau mọi hàm dưới đây:
 *
 *  1. Đổi tài khoản là hành động TOÀN MÁY (nó ghi đè
 *     `~/.claude/.credentials.json`), nên phiên đang chạy sẽ trôi sang tài
 *     khoản mới lúc nó làm mới token. Vì vậy `doiSlot` từ chối khi còn
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

const POOL_DEMO: BeePoolClaude = {
  dangBat: "work",
  slots: [
    {
      index: 1,
      name: "work",
      alias: null,
      email: "you@company.com",
      state: "active",
      dangBat: true,
      namGio: { phanTram: 29, resetLuc: null },
      bayNgay: { phanTram: 36, resetLuc: null },
      hetHan: false,
    },
    {
      index: 2,
      name: "personal",
      alias: null,
      email: "you@gmail.com",
      state: "idle",
      dangBat: false,
      namGio: { phanTram: 4, resetLuc: null },
      bayNgay: { phanTram: 11, resetLuc: null },
      hetHan: false,
    },
  ],
};

export interface TrangThaiSlayer {
  /** `tok` có trên máy không. Chưa có thì UI hiện ô dán token để cài. */
  daCai: boolean;
  pool: BeePoolClaude | null;
  /** claude.env đang ghim một token, đè lên slot đang chọn. */
  tokenGhim: boolean;
  /** Vì sao không đọc được pool, khi `tok` có mà vẫn hỏng. */
  message: string | null;
}

async function coTokenGhim(): Promise<boolean> {
  try {
    const noi = await fs.readFile(path.join(root(), "claude.env"), "utf8");
    return /^CLAUDE_CODE_OAUTH_TOKEN=\S/m.test(noi);
  } catch {
    return false;
  }
}

/** Bảng tài khoản cho /setup. Không ném: hỏng chỗ nào thì nói chỗ đó. */
export async function docTrangThaiSlayer(): Promise<TrangThaiSlayer> {
  if (isFixture()) {
    return { daCai: true, pool: POOL_DEMO, tokenGhim: false, message: null };
  }
  const ghim = await coTokenGhim();
  let ra: { stdout: string };
  try {
    ra = await run(TOK, ["list", "--json"], { timeout: 30_000, maxBuffer: 4 << 20 });
  } catch (e) {
    const loi = e as NodeJS.ErrnoException & { stderr?: string };
    if (loi.code === "ENOENT") {
      return { daCai: false, pool: null, tokenGhim: ghim, message: null };
    }
    return {
      daCai: true,
      pool: null,
      tokenGhim: ghim,
      message: (loi.stderr ?? loi.message).slice(0, 200),
    };
  }
  const pool = docPoolSlayer(ra.stdout);
  return {
    daCai: true,
    pool,
    tokenGhim: ghim,
    message: pool === null ? "`tok list --json` trả về thứ không đọc được." : null,
  };
}

/**
 * Đổi tài khoản đang bật. `phienDangChay` do lớp gọi đếm và truyền vào —
 * hàm này không tự đi đọc đĩa, để luật "không đổi khi đang chạy" test được
 * mà không cần dựng cả thư mục phiên.
 */
export async function doiSlot(target: string, phienDangChay: number): Promise<KetQua> {
  const gon = target.trim();
  if (!laMucTieuSlot(gon)) return { ok: false, message: "Tên slot không hợp lệ." };
  if (phienDangChay > 0) {
    return {
      ok: false,
      message:
        `Còn ${phienDangChay} phiên đang chạy. Đổi tài khoản là đổi cho CẢ MÁY, ` +
        "phiên đang chạy sẽ trôi sang tài khoản mới lúc nó làm mới token — dừng chúng trước đã.",
    };
  }
  if (isFixture()) return { ok: true };
  try {
    await run(TOK, ["switch", gon], { timeout: 60_000 });
    return { ok: true };
  } catch (e) {
    const loi = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    return { ok: false, message: (loi.stderr || loi.stdout || loi.message).slice(0, 300) };
  }
}

/** Chụp lại tài khoản `claude` đang đăng nhập thành một slot mới. */
export async function chupSlot(name: string): Promise<KetQua> {
  const gon = name.trim();
  if (!laTenSlot(gon)) {
    return { ok: false, message: "Tên slot chỉ nhận chữ, số, dấu chấm, gạch ngang và gạch dưới." };
  }
  if (isFixture()) return { ok: true };
  try {
    await run(TOK, ["add", gon], { timeout: 120_000 });
    return { ok: true };
  } catch (e) {
    const loi = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    return { ok: false, message: (loi.stderr || loi.stdout || loi.message).slice(0, 300) };
  }
}

/*
 * Thêm tài khoản KHÁC: `tok add <tên> --login` in ra URL rồi chờ mã dán
 * vào — cùng hình dạng với `claude setup-token`, nên cùng một tay lái.
 * Một luồng tại một thời điểm; mở luồng mới là bỏ luồng cũ.
 */
let luongThem: LuongPty | null = null;

function dongThem(): void {
  dongLuong(luongThem);
  luongThem = null;
}

export async function batDauThemSlot(name: string): Promise<KetQuaLink> {
  const gon = name.trim();
  if (!laTenSlot(gon)) {
    return { ok: false, message: "Tên slot chỉ nhận chữ, số, dấu chấm, gạch ngang và gạch dưới." };
  }
  if (isFixture()) return { ok: true, url: "https://claude.ai/oauth/authorize?demo=1" };

  dongThem();
  const luong = moLuong(`${TOK} add ${gon} --login`);
  luongThem = luong;

  const url = await cho(luong, extractOauthUrl);
  if (url !== null) return { ok: true, url };
  const thay = manHinhCuoi(luong.out);
  const vi = luong.done ? "luồng thoát trước khi in URL" : "hết giờ chờ URL";
  dongThem();
  return {
    ok: false,
    message: `Không lấy được link — ${vi}.${thay === null ? "" : ` Màn hình vừa in: “${thay}”`}`,
  };
}

export async function xongThemSlot(code: string): Promise<KetQua> {
  const gon = code.trim();
  if (!/^[A-Za-z0-9#_-]+$/.test(gon)) return { ok: false, message: "Đó không giống một mã xác nhận." };
  if (isFixture()) return { ok: true };

  const luong = luongThem;
  if (luong === null || luong.done) {
    dongThem();
    return { ok: false, message: "Không có luồng đăng nhập nào đang chờ — lấy link mới đã." };
  }

  await guiMa(luong, gon);
  // `tok` lưu credential rồi mới thoát: kết thúc sạch = xong.
  for (let i = 0; i < 120; i++) {
    if (i === 20) nhacEnter(luong);
    const tuChoi = loiOauth(luong.out);
    if (tuChoi !== null) {
      dongThem();
      return { ok: false, message: `${tuChoi} — lấy link mới rồi thử lại.` };
    }
    if (luong.done) {
      const thay = manHinhCuoi(luong.out);
      const ma = luong.p.exitCode;
      dongThem();
      if (ma === 0) return { ok: true };
      return {
        ok: false,
        message: `tok add thoát với mã ${ma ?? "?"}.${thay === null ? "" : ` Màn hình vừa in: “${thay}”`}`,
      };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const thay = manHinhCuoi(luong.out);
  dongThem();
  return {
    ok: false,
    message: `Hết giờ chờ tok add.${thay === null ? "" : ` Màn hình vừa in: “${thay}”`}`,
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

export async function caiSlayer(token: string): Promise<KetQua> {
  const gon = token.trim();
  if (!laTokenSlayer(gon)) {
    return { ok: false, message: "Token không đúng hình dạng (chuỗi ~47 ký tự chữ/số/-/_)." };
  }
  if (isFixture()) return { ok: true };
  try {
    // `set -o pipefail` để curl hỏng không bị `sh` nuốt thành thành công.
    await run(
      "bash",
      ["-o", "pipefail", "-c", `curl -fsSL "${URL_CAI}" | sh`],
      { timeout: 300_000, env: { ...process.env, TOKEN_SLAYER_TOKEN: gon }, maxBuffer: 4 << 20 },
    );
    return { ok: true };
  } catch (e) {
    const loi = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    const noi = (loi.stderr || loi.stdout || loi.message).replaceAll(gon, "…");
    return { ok: false, message: noi.slice(-300) };
  }
}

/** Gỡ token ghim trong claude.env để lựa chọn tài khoản ở đây có hiệu lực. */
export async function boTokenGhim(): Promise<KetQua> {
  if (isFixture()) return { ok: true };
  try {
    await fs.rm(path.join(root(), "claude.env"), { force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Không xoá được claude.env: ${(e as Error).message}` };
  }
}
