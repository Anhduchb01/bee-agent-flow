import "server-only";

import { getBee } from "@/lib/bee";

import { hanMucTu, tongHopMucDung } from "./aggregate";
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

const STATUS_URL = process.env.CLAUDE_STATUS_URL ?? "https://status.claude.com/api/v2/status.json";

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

function laIndicator(v: unknown): v is Indicator {
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
let cacheDichVu: { luc: number; gia: TrangThaiDichVu } | null = null;

async function docDichVu(): Promise<TrangThaiDichVu> {
  const now = Date.now();
  if (cacheDichVu && now - cacheDichVu.luc < 60_000) return cacheDichVu.gia;

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
      indicator: laIndicator(status?.indicator) ? status.indicator : "unknown",
      moTa: typeof status?.description === "string" ? status.description : "Unknown status",
      kiemLuc: new Date().toISOString(),
    };
  } catch {
    gia = {
      indicator: "unknown",
      moTa: "Could not reach status.claude.com",
      kiemLuc: new Date().toISOString(),
    };
  }

  cacheDichVu = { luc: now, gia };
  return gia;
}

export function createLiveClaudeSource(): ClaudeSource {
  return {
    async read(): Promise<ClaudeSnapshot> {
      const bee = getBee();
      const [runs, rateLimit, dichVu] = await Promise.all([
        bee.readRecent(DU_SO_DONG),
        bee.readClaudeRateLimit(),
        docDichVu(),
      ]);

      return {
        hanMuc: hanMucTu(rateLimit),
        mucDung: tongHopMucDung(runs),
        dichVu,
      };
    },
  };
}
