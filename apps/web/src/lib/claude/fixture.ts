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
      const trong = neverRan(await currentScene());

      return {
        hanMuc: [
          {
            cuaSo: "five_hour",
            status: "allowed",
            percentOf: trong ? null : 38,
            resetsAt: Math.floor(now / 1000) + 2 * 3600 + 14 * 60,
          },
          {
            cuaSo: "weekly",
            status: trong ? "allowed" : "warning",
            percentOf: trong ? null : 81,
            resetsAt: Math.floor(now / 1000) + 3 * 24 * 3600,
          },
        ],
        mucDung: trong
          ? {
              soLanChay: 0,
              soLanLoi: 0,
              token: 0,
              tiLeCache: 0,
              chiPhiHomNay: 0,
              chiPhiBayNgay: 0,
              dungViHetHanMuc: 0,
            }
          : {
              soLanChay: 13,
              soLanLoi: 6,
              token: 1_240_000,
              tiLeCache: 0.89,
              chiPhiHomNay: 2.41,
              chiPhiBayNgay: 14.8,
              dungViHetHanMuc: 3,
            },
        dichVu: {
          indicator: "none",
          moTa: "All Systems Operational",
          kiemLuc: new Date(now - 40_000).toISOString(),
        },
      };
    },
  };
}
