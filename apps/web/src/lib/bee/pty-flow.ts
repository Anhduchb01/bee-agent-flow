import "server-only";

import { spawn } from "node:child_process";

/**
 * Lái một lệnh đăng nhập tương tác từ web.
 *
 * Cả `claude setup-token` lẫn `tok add <tên> --login` đều cùng một hình
 * dạng: in ra một URL, chờ người dùng duyệt trên trình duyệt, rồi đọc lại
 * một mã dán vào. Cả hai đòi terminal thật, nên chạy dưới pty qua `script`
 * (util-linux). Mọi thứ khó ở đây là chỗ đã trả giá bằng buổi chiều 25/08:
 *
 *  · pty của `script` mặc định 80 cột, mà UI ngắt cứng theo bề ngang —
 *    URL bị chặt đôi và token (dài hơn 80) sẽ bị lưu mất nửa sau **im
 *    lặng**. `stty cols 400` trước khi chạy.
 *  · Enter là `\r`, không phải `\n`.
 *  · và `\r` phải đến trong CỤM RIÊNG: cụm quá ~56 byte bị đọc là "dán",
 *    mà dán thì `\r` dính đuôi chỉ là ký tự. Hai lỗi này nhìn từ ngoài
 *    giống hệt nhau — mã nằm trong ô, không có gì xảy ra.
 */

export interface LuongPty {
  p: ReturnType<typeof spawn>;
  out: string;
  done: boolean;
  timeout: NodeJS.Timeout;
}

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g;

/** Mở luồng. `song` = số phút giữ tiến trình trước khi tự dọn. */
export function moLuong(lenh: string, song = 10): LuongPty {
  const p = spawn("script", ["-qec", `stty cols 400 rows 100; ${lenh}`, "/dev/null"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, TERM: "xterm-256color" },
  });
  const luong: LuongPty = {
    p,
    out: "",
    done: false,
    // Một luồng bị bỏ giữa chừng không được nằm lại ôm nửa cái đăng nhập.
    timeout: setTimeout(() => dongLuong(luong), song * 60 * 1000),
  };
  p.stdout?.on("data", (d: Buffer) => (luong.out += d.toString()));
  p.stderr?.on("data", (d: Buffer) => (luong.out += d.toString()));
  p.on("close", () => (luong.done = true));
  return luong;
}

export function dongLuong(luong: LuongPty | null): void {
  if (luong === null) return;
  clearTimeout(luong.timeout);
  try {
    luong.p.kill("SIGKILL");
  } catch {
    // Đi rồi.
  }
}

/** Chờ tới khi `tim` bắt được thứ cần trên màn hình, tối đa `giay` giây. */
export async function cho<T>(
  luong: LuongPty,
  tim: (out: string) => T | null,
  giay = 15,
): Promise<T | null> {
  for (let i = 0; i < giay * 4; i++) {
    const thay = tim(luong.out);
    if (thay !== null) return thay;
    if (luong.done) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return tim(luong.out);
}

/** Dán mã vào: nội dung một lần ghi, Enter một lần ghi khác. */
export async function guiMa(luong: LuongPty, ma: string): Promise<void> {
  luong.p.stdin?.write(ma);
  await new Promise((r) => setTimeout(r, 500));
  luong.p.stdin?.write("\r");
}

/** Enter nhắc lại — rẻ, vô hại khi ô trống, đỡ cho máy chậm. */
export function nhacEnter(luong: LuongPty): void {
  if (!luong.done) luong.p.stdin?.write("\r");
}

/**
 * Dòng cuối màn hình vừa vẽ, để câu báo lỗi gọi đúng tên sự cố. Bỏ ANSI và
 * phần đệm của UI; token chỉ xuất hiện sau khi gửi mã, nhưng che sẵn — chuỗi
 * này đi ra màn hình người dùng.
 */
export function manHinhCuoi(out: string): string | null {
  const dong = out
    .replace(ANSI_RE, "")
    .replace(OSC_RE, "")
    .replace(/sk-ant-oat01-[A-Za-z0-9_-]+/g, "sk-ant-oat01-…")
    .split(/[\r\n]+/)
    .map((d) => d.trim())
    .filter((d) => d !== "" && !/^\.+$/.test(d));
  const cuoi = dong.at(-1);
  return cuoi === undefined ? null : cuoi.slice(0, 160);
}

/** Chính lời của luồng khi nó từ chối mã, ví dụ "OAuth error: …". */
export function loiOauth(out: string): string | null {
  const sach = out.replace(ANSI_RE, "");
  return /(?:OAuth error|Login failed|Invalid code)[^\r\n]{0,120}/.exec(sach)?.[0].trim() ?? null;
}
