/**
 * Mức dùng và trạng thái của Claude.
 *
 * Kiểu ở đây bám vào **hình dạng đã kiểm bằng cách chạy thật**
 * `claude -p --output-format stream-json --verbose` (bản 2.1.161), không phải
 * theo trí nhớ:
 *
 * - Dòng `rate_limit_event` mang `rate_limit_info`:
 *   `{ status, resetsAt, rateLimitType, overageStatus, isUsingOverage }`
 * - Dòng `result` mang `usage.{input_tokens, output_tokens,
 *   cache_read_input_tokens, cache_creation_input_tokens}`, `total_cost_usd`,
 *   `stop_reason`, `api_error_status`
 * - Trạng thái dịch vụ: `https://anthropic.statuspage.io/api/v2/status.json` →
 *   `{ status: { indicator, description } }`, `indicator: "none"` = bình thường.
 *   KHÔNG phải `status.claude.com`: tên đó phân giải về Statuspage nhưng
 *   Statuspage phục vụ chứng chỉ `*.statuspage.io` cho nó, nên fetch đổ ở TLS.
 *
 * Chi tiết và những thứ **không** lấy được ghi ở
 * [`docs/design/ui-ux-de-xuat.md`](../../../../docs/design/ui-ux-de-xuat.md) §3.5.
 */

/** Cửa sổ hạn mức. `rateLimitType` của `rate_limit_event`. */
export type UsageWindow = "five_hour" | "weekly";

export interface HanMuc {
  cuaSo: UsageWindow;
  /** `status` của `rate_limit_event`. */
  status: "allowed" | "warning" | "exceeded";
  /**
   * Phần trăm đã dùng, `null` khi chưa có nguồn.
   *
   * **Chưa nguồn nào xác minh được cho ra con số này.** `rate_limit_event` chỉ
   * cho `status` và `resetsAt`; `total_cost_usd` là giá quy đổi theo API chứ
   * không phải mức tiêu thụ hạn mức gói thuê bao. Trường để `null` được, và UI
   * phải hiện đồng hồ đếm ngược thay vì một thanh trống — con số này là chỗ dễ
   * bịa nhất trong cả màn hình.
   */
  percentOf: number | null;
  /** Unix epoch giây; `null` khi nguồn không kèm giờ reset. */
  resetsAt: number | null;
}

export interface ToolCard {
  /** Số lần chạy trong ngày, và bao nhiêu lần thất bại. */
  soLanChay: number;
  soLanLoi: number;
  /** Tổng token vào + ra + cache trong ngày. */
  token: number;
  /** Tỉ lệ token đọc từ cache, 0–1. Quyết định phần lớn chi phí của khối việc này. */
  tiLeCache: number;
  chiPhiHomNay: number;
  chiPhiBayNgay: number;
  /** Số lần chạy dừng vì hết hạn mức — từ `stop_reason` / `api_error_status`. */
  dungViHetHanMuc: number;
}

export interface TrangThaiDichVu {
  /** `indicator` của status.claude.com; `none` là bình thường. */
  indicator: "none" | "minor" | "major" | "critical" | "unknown";
  moTa: string;
  /** Lúc kiểm gần nhất, ISO. */
  kiemLuc: string;
}

export interface ClaudeSnapshot {
  hanMuc: HanMuc[];
  mucDung: ToolCard;
  dichVu: TrangThaiDichVu;
}

export interface ClaudeSource {
  read(): Promise<ClaudeSnapshot>;
}
