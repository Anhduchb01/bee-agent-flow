/**
 * Cộng dồn `recent.jsonl` thành số liệu cho dashboard.
 *
 * Tách khỏi `live.ts` để test được mà không cần `/srv/bee`, không cần mạng, và
 * không cần `server-only`. Đây là chỗ duy nhất biết công thức; `live.ts` chỉ
 * đọc file rồi gọi vào đây.
 */
import type { BeeClaudeAccountUsage, BeeClaudeRateLimit, BeeClaudeWindow, BeeRecentRun } from "@/lib/bee/types";

import type { CuaSo, HanMuc, MucDung } from "./types";

const NGAY = 24 * 60 * 60 * 1000;

function tokenCua(r: BeeRecentRun): number {
  return (
    (r.tokens_in ?? 0) +
    (r.tokens_out ?? 0) +
    (r.tokens_cache_read ?? 0) +
    (r.tokens_cache_write ?? 0)
  );
}

/**
 * Lần chạy này có dừng vì hết hạn mức không?
 *
 * Chỉ `api_error_status === 429` là **biết chắc**. `stop_reason` của Claude CLI
 * là tập đóng gồm `end_turn`/`max_tokens`/`tool_use`/`stop_sequence`/`refusal` —
 * không giá trị nào nói về hạn mức. Vế thứ hai ở đây là dự phòng cho ngày CLI
 * thêm một giá trị mới, và nó cố ý khớp lỏng.
 *
 * `undefined` khác `null` khác `0`: bản ghi của rule 03 (chạy CI, không gọi
 * agent) không có trường nào cả, và đếm nó là 0 hay là lỗi đều sai.
 */
function hetHanMuc(r: BeeRecentRun): boolean {
  if (r.api_error_status === 429) return true;
  return typeof r.stop_reason === "string" && /rate[_-]?limit|quota/i.test(r.stop_reason);
}

/** Cùng một ngày theo giờ máy chạy dashboard — "hôm nay" là hôm nay của người xem. */
function cungNgay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function tongHopMucDung(runs: BeeRecentRun[], now: Date = new Date()): MucDung {
  let soLanChay = 0;
  let soLanLoi = 0;
  let token = 0;
  let cacheRead = 0;
  let chiPhiHomNay = 0;
  let chiPhiBayNgay = 0;
  let dungViHetHanMuc = 0;

  for (const r of runs) {
    const at = new Date(r.at);
    // Dòng có `at` không parse được thì bỏ hẳn: cộng nó vào "bảy ngày" nhưng
    // không vào "hôm nay" sẽ cho ra hai con số không cộng lại được với nhau.
    if (Number.isNaN(at.getTime())) continue;

    const tuoi = now.getTime() - at.getTime();
    if (tuoi <= 7 * NGAY) chiPhiBayNgay += r.cost_usd ?? 0;
    if (!cungNgay(at, now)) continue;

    soLanChay += 1;
    if (r.result !== "ok") soLanLoi += 1;
    token += tokenCua(r);
    cacheRead += r.tokens_cache_read ?? 0;
    chiPhiHomNay += r.cost_usd ?? 0;
    if (hetHanMuc(r)) dungViHetHanMuc += 1;
  }

  return {
    soLanChay,
    soLanLoi,
    token,
    tiLeCache: token > 0 ? cacheRead / token : 0,
    chiPhiHomNay,
    chiPhiBayNgay,
    dungViHetHanMuc,
  };
}

function laCuaSo(v: string): v is CuaSo {
  return v === "five_hour" || v === "weekly";
}

/**
 * `rate_limit_event` gần nhất → danh sách hạn mức.
 *
 * **Trả về nhiều nhất MỘT phần tử**, vì file chỉ giữ sự kiện cuối cùng và mỗi
 * sự kiện chỉ nói về một cửa sổ. Fixture dựng đủ hai thanh; dữ liệu thật thường
 * chỉ có một, và UI phải chịu được điều đó — đó là một trong bốn thứ fixture
 * không chứng minh được.
 *
 * `phanTram` luôn `null`. Không nguồn nào đã kiểm chứng phát ra con số này;
 * `total_cost_usd` là giá quy đổi theo API chứ không phải mức tiêu thụ hạn mức
 * của gói thuê bao. Đây là chỗ dễ bịa nhất trong cả màn hình.
 */
export function hanMucTu(rl: BeeClaudeRateLimit | null): HanMuc[] {
  if (!rl) return [];
  // Kiểu cửa sổ lạ thì bỏ hẳn, không quy về `five_hour`: một thanh dán nhãn sai
  // tệ hơn hẳn một thanh vắng mặt.
  if (!laCuaSo(rl.rateLimitType)) return [];

  const s = rl.status.toLowerCase();
  const trangThai: HanMuc["trangThai"] = /reject|exceed|block/.test(s)
    ? "exceeded"
    : /warn/.test(s)
      ? "warning"
      : "allowed";

  return [{ cuaSo: rl.rateLimitType, trangThai, phanTram: null, resetsAt: rl.resetsAt }];
}

/**
 * Windows from the account-wide oauth usage endpoint — the one source that
 * DOES emit a percentage (it powers Claude Code's /usage screen). Unlike
 * rate_limit_event this covers the whole account, other machines included.
 */
export function hanMucTuTaiKhoan(acc: BeeClaudeAccountUsage): HanMuc[] {
  const mot = (cuaSo: CuaSo, w: BeeClaudeWindow | null): HanMuc[] => {
    if (w === null) return [];
    const trangThai: HanMuc["trangThai"] =
      w.percent >= 100 ? "exceeded" : w.percent >= 80 ? "warning" : "allowed";
    const epoch = w.resets_at !== null ? Math.floor(Date.parse(w.resets_at) / 1000) : NaN;
    return [
      {
        cuaSo,
        trangThai,
        phanTram: w.percent,
        resetsAt: Number.isFinite(epoch) ? epoch : null,
      },
    ];
  };
  return [...mot("five_hour", acc.five_hour), ...mot("weekly", acc.seven_day)];
}
