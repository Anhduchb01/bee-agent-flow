import "server-only";

import { getBee } from "@/lib/bee";

import { quotaFrom, accountQuota, aggregateUsage } from "./aggregate";
import type { ClaudeSnapshot, ClaudeSource, TrangThaiDichVu } from "./types";

/**
 * Bản đọc số liệu thật. Hai nửa với hai mức khó rất khác nhau:
 *
 * **Nửa dễ — trạng thái dịch vụ.** Một `fetch` tới status.claude.com.
 *
 * **Nửa khó — mức dùng.** Dữ liệu nằm ở dòng `result` và `rate_limit_event` của
 * stream-json, mà stream đó do **`bee-agent`** sinh ra. App chạy dưới `bee-web`
 * và **không được đọc credential hay home của agent** — đó là ranh giới hai
 * UID, không phải bất tiện.
 *
 * Cách vòng qua ranh giới đó: reconciler (chạy dưới `bee-orch`, đọc được stream)
 * bóc sẵn ra hai chỗ mà `bee-web` đọc được — `recent.jsonl` và
 * `state/claude-rate-limit.json`. Nên file này **không mở một file nào**: nó đi
 * qua `lib/bee/`, đúng cửa duy nhất ra `/srv/bee/`.
 */

/**
 * `anthropic.statuspage.io`, KHÔNG phải `status.claude.com`.
 *
 * Cả `status.claude.com` lẫn `status.anthropic.com` đều phân giải về Statuspage,
 * nhưng Statuspage phục vụ chứng chỉ `*.statuspage.io` cho chúng — không có SAN
 * nào khớp, nên mọi `fetch` tới đó đổ ở bước TLS. Kiểm bằng `openssl s_client`
 * trên máy thật ngày 2026-08-14: subject `CN = *.statuspage.io`, SAN chỉ có
 * `*.statuspage.io` và `statuspage.io`.
 *
 * Triệu chứng trước khi sửa: ô trạng thái dịch vụ luôn hiện "không hỏi được",
 * ở mọi máy, mãi mãi — và nó trông y hệt một sự cố mạng tạm thời.
 */
const STATUS_URL =
  process.env.CLAUDE_STATUS_URL ?? "https://anthropic.statuspage.io/api/v2/status.json";

/**
 * Bao nhiêu dòng `recent.jsonl` cần đọc.
 *
 * `record_run()` cắt file ở 200 dòng, nên đây là "tất cả những gì còn lại".
 * Xin nhiều hơn cũng không có, và xin ít hơn thì chi phí bảy ngày lặng lẽ thiếu
 * — không có gì trên màn hình cho biết con số đã bị cắt cụt.
 */
const DU_SO_DONG = 200;

const INDICATOR = ["none", "minor", "major", "critical"] as const;
type Indicator = (typeof INDICATOR)[number];

function isIndicator(v: unknown): v is Indicator {
  return typeof v === "string" && (INDICATOR as readonly string[]).includes(v);
}

/**
 * status.claude.com nằm ngoài tầm kiểm soát và có thể chậm hoặc chết. Nó KHÔNG
 * được phép làm hỏng cả màn hình: mức dùng vẫn đọc được từ đĩa, và đó mới là
 * phần người dùng vào đây để xem.
 *
 * Cache 60 giây vì mỗi lần render dashboard sẽ gọi một lần, và trang này được
 * mở suốt ngày.
 */
let cacheDichVu: { at: number; gia: TrangThaiDichVu } | null = null;

async function readServices(): Promise<TrangThaiDichVu> {
  const now = Date.now();
  if (cacheDichVu && now - cacheDichVu.at < 60_000) return cacheDichVu.gia;

  let gia: TrangThaiDichVu;
  try {
    const res = await fetch(STATUS_URL, {
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    const status = (body as { status?: { indicator?: unknown; description?: unknown } })?.status;
    gia = {
      // Giá trị lạ về `unknown` chứ không về `none`: "không biết" và "bình
      // thường" là hai chuyện khác nhau, và gộp lại thì một sự cố đang diễn ra
      // sẽ hiện ra màu xanh.
      indicator: isIndicator(status?.indicator) ? status.indicator : "unknown",
      hint: typeof status?.description === "string" ? status.description : "Unknown status",
      kiemLuc: new Date().toISOString(),
    };
  } catch (e) {
    // Nêu ĐÍCH DANH host đang hỏi, lấy từ chính `STATUS_URL`. Câu cũ ghi cứng
    // "status.claude.com" nên sau khi đổi endpoint nó vẫn tố cáo một tên miền
    // không còn được gọi tới nữa — và người đọc đi kiểm nhầm chỗ.
    let host = STATUS_URL;
    try {
      host = new URL(STATUS_URL).host;
    } catch {
      /* URL do người cấu hình đặt sai — giữ nguyên chuỗi, nó vẫn nói được vấn đề */
    }
    gia = {
      indicator: "unknown",
      hint: `Could not reach ${host}: ${e instanceof Error ? e.message : String(e)}`,
      kiemLuc: new Date().toISOString(),
    };
  }

  cacheDichVu = { at: now, gia };
  return gia;
}

export function createLiveClaudeSource(): ClaudeSource {
  return {
    async read(): Promise<ClaudeSnapshot> {
      const bee = getBee();
      const [runs, rateLimit, accountUsage, dichVu] = await Promise.all([
        bee.readRecent(DU_SO_DONG),
        bee.readClaudeRateLimit(),
        bee.readClaudeUsage(),
        readServices(),
      ]);

      return {
        // Account-wide windows (oauth usage endpoint, refreshed by the
        // button) carry real percentages for BOTH windows — prefer them.
        // rate_limit_event stays as fallback: status only, no percent.
        quota: accountUsage !== null ? accountQuota(accountUsage) : quotaFrom(rateLimit),
        toolUse: aggregateUsage(runs),
        dichVu,
      };
    },
  };
}
