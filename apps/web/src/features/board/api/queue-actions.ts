"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import { boQuaViec, doiThuTu, themViec } from "../lib/queue";
import { docHangDoi, ghiHangDoi } from "@/lib/bee/queue-fs";
import { chayNhipHangDoi } from "@/lib/bee/tick";
import type { BeeSessionMode, BeeSessionModel } from "@/lib/bee/types";

/**
 * Sửa hàng đợi Autopilot. Mọi action đọc–sửa–ghi trọn một lượt: file nhỏ, và
 * người sửa duy nhất ngoài tick là màn hình này, nên khoá phức tạp hơn thế là
 * thừa. Ghi vẫn nguyên tử (tmp + rename) ở tầng queue-fs.
 */

export interface KetQua {
  ok: boolean;
  message: string;
}

const KHONG_QUYEN: KetQua = { ok: false, message: "You are not allowed to do this." };

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

function xong(): KetQua {
  revalidatePath("/projects");
  revalidatePath("/canvas");
  return { ok: true, message: "" };
}

export async function themVaoHangDoiAction(input: {
  slug: string;
  repo: string;
  issue: number;
  mode?: BeeSessionMode;
  model?: BeeSessionModel;
}): Promise<KetQua> {
  if (!(await getActor())) return KHONG_QUYEN;
  if (!Number.isInteger(input.issue) || input.issue <= 0) {
    return { ok: false, message: "Invalid issue number." };
  }
  const goc = root();
  await ghiHangDoi(goc, themViec(await docHangDoi(goc), input));
  return xong();
}

export async function boKhoiHangDoiAction(repo: string, issue: number): Promise<KetQua> {
  if (!(await getActor())) return KHONG_QUYEN;
  const goc = root();
  await ghiHangDoi(goc, boQuaViec(await docHangDoi(goc), repo, issue));
  return xong();
}

export async function doiThuTuAction(
  repo: string,
  issue: number,
  buoc: -1 | 1,
): Promise<KetQua> {
  if (!(await getActor())) return KHONG_QUYEN;
  if (buoc !== -1 && buoc !== 1) return { ok: false, message: "Invalid step." };
  const goc = root();
  await ghiHangDoi(goc, doiThuTu(await docHangDoi(goc), repo, issue, buoc));
  return xong();
}

/** ⏸ — hàng đợi giữ nguyên, chỉ ngừng nhặt việc mới. */
export async function tamDungHangDoiAction(paused: boolean): Promise<KetQua> {
  if (!(await getActor())) return KHONG_QUYEN;
  const goc = root();
  await ghiHangDoi(goc, { ...(await docHangDoi(goc)), paused });
  return xong();
}

/**
 * "Run now" — chạy MỘT nhịp Autopilot ngay, không đợi `bee-tick.timer`.
 *
 * Timer 30 phút là nhịp nền, không phải lịch: hàng đợi vốn chạy bất cứ lúc
 * nào. Nhưng "bất cứ lúc nào" mà phải chờ tới nửa tiếng thì trên màn hình nó
 * đọc y hệt "hệ thống không làm gì" — nên phải có một nút nói ngược lại.
 *
 * Cùng một `chayNhipHangDoi` mà timer gọi: vẫn mở nhiều nhất MỘT phiên, vẫn
 * qua phanh hạn mức, vẫn tôn trọng PAUSE và ⏸. Nút này rút ngắn thời gian
 * CHỜ, không mở thêm cửa nào.
 */
export async function chayNgayAction(): Promise<KetQua> {
  if (!(await getActor())) return KHONG_QUYEN;
  const kq = await chayNhipHangDoi();
  revalidatePath("/projects");
  revalidatePath("/canvas");
  revalidatePath("/brief");
  // Không mở được KHÔNG phải lỗi: hết việc, PAUSE, ⏸, hết slot, phanh hạn mức
  // — năm chuyện khác nhau, và người bấm cần biết là cái nào.
  return { ok: true, message: kq.daMo === null ? kq.lyDo : `Opened a session for ${kq.daMo}` };
}
