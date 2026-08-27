import "server-only";

import { neverRan, currentScene } from "@/lib/fixtures/scene";

import type { ClaudeSnapshot, ClaudeSource } from "./types";

/**
 * Số liệu mẫu. Cùng hình dạng với thứ `run_agent()` sẽ ghi ra khi reconciler
 * được sửa để giữ lại `usage` — hiện nó bóc dòng `result` rồi vứt các trường đó.
 */
export function createFixtureClaudeSource(): ClaudeSource {
  return {
    async read(): Promise<ClaudeSnapshot> {
      const now = Date.now();
      /*
       * Máy chưa chạy lần nào thì chưa tiêu token nào, và `rate_limit_event`
       * cũng chưa từng xuất hiện nên chưa biết hạn mức — `percentOf: null`.
       *
       * Đây cũng là cảnh duy nhất dựng được đường `null`, mà `null` lại chính
       * là thứ dữ liệu thật sẽ trả về: chưa nguồn nào đã kiểm chứng phát ra
       * phần trăm (xem `types.ts`). Không có cảnh này thì nhánh đó chưa từng
       * được ai nhìn thấy trước khi lên máy thật.
       */
      const within = neverRan(await currentScene());

      return {
        quota: [
          {
            usageWindow: "five_hour",
            status: "allowed",
            percentOf: within ? null : 38,
            resetsAt: Math.floor(now / 1000) + 2 * 3600 + 14 * 60,
          },
          {
            usageWindow: "weekly",
            status: within ? "allowed" : "warning",
            percentOf: within ? null : 81,
            resetsAt: Math.floor(now / 1000) + 3 * 24 * 3600,
          },
        ],
        toolUse: within
          ? {
              runCount: 0,
              errorCount: 0,
              token: 0,
              tiLeCache: 0,
              costToday: 0,
              costSevenDays: 0,
              stoppedOnQuota: 0,
            }
          : {
              runCount: 13,
              errorCount: 6,
              token: 1_240_000,
              tiLeCache: 0.89,
              costToday: 2.41,
              costSevenDays: 14.8,
              stoppedOnQuota: 3,
            },
        dichVu: {
          indicator: "none",
          hint: "All Systems Operational",
          kiemLuc: new Date(now - 40_000).toISOString(),
        },
      };
    },
  };
}
