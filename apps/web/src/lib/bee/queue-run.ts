import { viecKeTiep } from "./queue-next";
import type { HangDoi, ViecTrongHang } from "./types";

/**
 * Một nhịp của hàng đợi Autopilot — hàm THUẦN theo nghĩa mọi tác dụng phụ đều
 * đi qua tham số (`moPhien`, `ghi`). Nhờ vậy cái vòng chạy lúc 2 giờ sáng được
 * kiểm bằng test bàn giấy, không phải bằng cách thức đêm nhìn nó.
 *
 * Ba nguyên tắc:
 *  · **Mỗi nhịp mở nhiều nhất MỘT phiên.** Tick sau mở tiếp. Dồn cả hàng vào
 *    một nhịp là cách nhanh nhất để đốt hạn mức và lấp đĩa cùng lúc.
 *  · **Không nuốt lý do.** Từ chối vì PAUSE, vì ⏸, vì hết slot, vì phanh hạn
 *    mức — bốn chuyện khác nhau, và sáng dậy người dùng cần biết cái nào.
 *  · **Từ chối không được làm mất việc.** `moPhien` hỏng thì việc quay lại
 *    `waiting` kèm lý do, không phải biến mất hay kẹt ở `running`.
 */

export interface KetQuaNhip {
  daMo: ViecTrongHang | null;
  lyDo: string;
}

export interface CuaNhip {
  hangDoi: HangDoi;
  /** File PAUSE của cả máy — khác với ⏸ của riêng hàng đợi. */
  dangPause: boolean;
  soPhienDangChay: number;
  songSongToiDa?: number;
  moPhien: (v: ViecTrongHang) => Promise<{ ok: true; id: string } | { ok: false; message: string }>;
  ghi: (q: HangDoi) => Promise<void>;
}

function capNhat(q: HangDoi, v: ViecTrongHang, thay: Partial<ViecTrongHang>): HangDoi {
  return {
    ...q,
    items: q.items.map((i) =>
      i.repo === v.repo && i.issue === v.issue ? { ...i, ...thay } : i,
    ),
  };
}

export async function chayMotNhip(cua: CuaNhip): Promise<KetQuaNhip> {
  const toiDa = cua.songSongToiDa ?? 1;

  if (cua.dangPause) return { daMo: null, lyDo: "PAUSE đang bật — máy không mở phiên nào" };
  if (cua.hangDoi.paused) return { daMo: null, lyDo: "hàng đợi đang tạm dừng (⏸)" };
  if (cua.soPhienDangChay >= toiDa) {
    return { daMo: null, lyDo: `đã đủ ${toiDa} phiên song song — chờ slot` };
  }

  const viec = viecKeTiep(cua.hangDoi, { songSongToiDa: toiDa });
  if (viec === null) return { daMo: null, lyDo: "hết việc chờ trong hàng đợi" };

  const ket = await cua.moPhien(viec);
  if (!ket.ok) {
    // Phanh hạn mức (T5) trả lời ở đây. Việc KHÔNG mất và KHÔNG kẹt: nó về lại
    // waiting kèm lý do, nhịp sau thử lại khi hạn mức đã reset.
    await cua.ghi(capNhat(cua.hangDoi, viec, { status: "waiting", reason: ket.message }));
    return { daMo: null, lyDo: ket.message };
  }

  await cua.ghi(
    capNhat(cua.hangDoi, viec, { status: "running", sessionId: ket.id, reason: null }),
  );
  return { daMo: viec, lyDo: `đã mở phiên cho ${viec.repo}#${viec.issue}` };
}
