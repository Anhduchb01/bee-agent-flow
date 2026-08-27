/**
 * Cộng dồn `recent.jsonl` thành số liệu cho dashboard.
 *
 * Tách khỏi `live.ts` để test được mà không cần `/srv/bee`, không cần mạng, và
 * không cần `server-only`. Đây là chỗ duy nhất biết công thức; `live.ts` chỉ
 * đọc file rồi gọi vào đây.
 */
import type { BeeClaudeAccountUsage, BeeClaudeRateLimit, BeeClaudeWindow, BeeRecentRun } from "@/lib/bee/types";

import type { UsageWindow, Quota, ToolCard } from "./types";

const NGAY = 24 * 60 * 60 * 1000;

function tokensOf(r: BeeRecentRun): number {
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
function quotaExhausted(r: BeeRecentRun): boolean {
  if (r.api_error_status === 429) return true;
  return typeof r.stop_reason === "string" && /rate[_-]?limit|quota/i.test(r.stop_reason);
}

/** Cùng một ngày theo giờ máy chạy dashboard — "hôm nay" là hôm nay của người xem. */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function aggregateUsage(runs: BeeRecentRun[], now: Date = new Date()): ToolCard {
  let runCount = 0;
  let errorCount = 0;
  let token = 0;
  let cacheRead = 0;
  let costToday = 0;
  let costSevenDays = 0;
  let stoppedOnQuota = 0;

  for (const r of runs) {
    const at = new Date(r.at);
    // Dòng có `at` không parse được thì bỏ hẳn: cộng nó vào "bảy ngày" nhưng
    // không vào "hôm nay" sẽ cho ra hai con số không cộng lại được với nhau.
    if (Number.isNaN(at.getTime())) continue;

    const age = now.getTime() - at.getTime();
    if (age <= 7 * NGAY) costSevenDays += r.cost_usd ?? 0;
    if (!sameDay(at, now)) continue;

    runCount += 1;
    if (r.result !== "ok") errorCount += 1;
    token += tokensOf(r);
    cacheRead += r.tokens_cache_read ?? 0;
    costToday += r.cost_usd ?? 0;
    if (quotaExhausted(r)) stoppedOnQuota += 1;
  }

  return {
    runCount,
    errorCount,
    token,
    cacheRate: token > 0 ? cacheRead / token : 0,
    costToday,
    costSevenDays,
    stoppedOnQuota,
  };
}

function isWindow(v: string): v is UsageWindow {
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
 * `percentOf` luôn `null`. Không nguồn nào đã kiểm chứng phát ra con số này;
 * `total_cost_usd` là giá quy đổi theo API chứ không phải mức tiêu thụ hạn mức
 * của gói thuê bao. Đây là chỗ dễ bịa nhất trong cả màn hình.
 */
export function quotaFrom(rl: BeeClaudeRateLimit | null): Quota[] {
  if (!rl) return [];
  // Kiểu cửa sổ lạ thì bỏ hẳn, không quy về `five_hour`: một thanh dán nhãn sai
  // tệ hơn hẳn một thanh vắng mặt.
  if (!isWindow(rl.rateLimitType)) return [];

  const s = rl.status.toLowerCase();
  const status: Quota["status"] = /reject|exceed|block/.test(s)
    ? "exceeded"
    : /warn/.test(s)
      ? "warning"
      : "allowed";

  return [{ usageWindow: rl.rateLimitType, status, percentOf: null, resetsAt: rl.resetsAt }];
}

/**
 * Windows from the account-wide oauth usage endpoint — the one source that
 * DOES emit a percentage (it powers Claude Code's /usage screen). Unlike
 * rate_limit_event this covers the whole account, other machines included.
 */
export function accountQuota(acc: BeeClaudeAccountUsage): Quota[] {
  const windowQuotas = (usageWindow: UsageWindow, w: BeeClaudeWindow | null): Quota[] => {
    if (w === null) return [];
    const status: Quota["status"] =
      w.percent >= 100 ? "exceeded" : w.percent >= 80 ? "warning" : "allowed";
    const epoch = w.resets_at !== null ? Math.floor(Date.parse(w.resets_at) / 1000) : NaN;
    return [
      {
        usageWindow,
        status,
        percentOf: w.percent,
        resetsAt: Number.isFinite(epoch) ? epoch : null,
      },
    ];
  };
  return [...windowQuotas("five_hour", acc.five_hour), ...windowQuotas("weekly", acc.seven_day)];
}
