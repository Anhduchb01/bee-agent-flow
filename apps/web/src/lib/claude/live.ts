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
 * ranh giới hai UID, không phải bất tiện. Đường đi sạch duy nhất:
 *
 * 1. `run_agent()` trong `apps/reconciler/bin/worker.sh` bóc thêm mấy trường
 *    (`usage.*`, `total_cost_usd`, `stop_reason`, `api_error_status`) — nó đã
 *    parse đúng dòng đó rồi, chỉ là đang vứt đi.
 * 2. Ghi vào `recent.jsonl` qua `record_run()`, hoặc một file riêng dưới
 *    `/srv/bee/`.
 * 3. App đọc file đó như mọi thứ khác trong `lib/bee/`.
 *
 * Bước 1 và 2 là **thay đổi trong reconciler**, mà theo `AGENTS.md` §2 thì phải
 * hỏi trước. Chưa hỏi, nên chưa làm.
 *
 * Và ngay cả khi làm xong: **`phanTram` vẫn không lấy được** từ đó. Xem
 * `types.ts`.
 */
export function createLiveClaudeSource(): ClaudeSource {
  return {
    read: () => {
      throw new Error(
        "CLAUDE_SOURCE=live chưa cài đặt (pha B). Cần reconciler giữ lại usage trước — xem lib/claude/live.ts.",
      );
    },
  };
}
