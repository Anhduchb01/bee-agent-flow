import "server-only";

import type { ClaudeSource } from "./types";

/**
 * Bản đọc số liệu thật. Chưa cài đặt — đây là pha B, và nó có **hai phần với
 * hai mức khó rất khác nhau**:
 *
 * **Phần dễ — trạng thái dịch vụ.** Một `fetch` tới
 * `https://status.claude.com/api/v2/status.json` theo lịch. Không ràng buộc gì.
 *
 * **Phần khó — mức dùng.** Dữ liệu nằm ở dòng `result` và `rate_limit_event` của
 * stream-json, mà stream đó do **`bee-agent`** sinh ra khi worker chạy. App chạy
 * dưới `bee-web` và **không được đọc credential hay home của agent** — đó là
 * ranh giới hai UID, không phải bất tiện.
 *
 * Phía reconciler **đã xong**: `run_agent()` giữ lại `usage.*`,
 * `total_cost_usd`, `stop_reason`, `api_error_status` rồi `record_run()` gộp
 * vào từng dòng `recent.jsonl`; `rate_limit_event` ghi riêng ra
 * `state/claude-rate-limit.json` vì hạn mức là chuyện của cả tài khoản chứ
 * không của một lần chạy. Hình dạng cả hai nằm ở `lib/bee/types.ts`.
 *
 * Việc còn lại ở đây là cộng dồn: đọc `recent.jsonl` qua `lib/bee/`, cộng token
 * và chi phí của hôm nay và bảy ngày, rồi đọc file hạn mức. Không có việc nào
 * chạm ranh giới UID nữa.
 *
 * Nhưng **`phanTram` vẫn không lấy được**: không nguồn nào phát ra nó. Xem
 * `types.ts`.
 */
export function createLiveClaudeSource(): ClaudeSource {
  return {
    read: () => {
      throw new Error(
        "CLAUDE_SOURCE=live is not implemented yet (phase B). The reconciler now records usage; what is left is summing recent.jsonl — see lib/claude/live.ts.",
      );
    },
  };
}
