import "server-only";

import type { ClaudeSnapshot, ClaudeSource } from "./types";

/**
 * Số liệu mẫu. Cùng hình dạng với thứ `run_agent()` sẽ ghi ra khi reconciler
 * được sửa để giữ lại `usage` — hiện nó bóc dòng `result` rồi vứt các trường đó.
 */
export function createFixtureClaudeSource(): ClaudeSource {
  return {
    async read(): Promise<ClaudeSnapshot> {
      const now = Date.now();
      return {
        hanMuc: [
          {
            cuaSo: "five_hour",
            trangThai: "allowed",
            phanTram: 38,
            resetsAt: Math.floor(now / 1000) + 2 * 3600 + 14 * 60,
          },
          {
            cuaSo: "weekly",
            trangThai: "warning",
            phanTram: 81,
            resetsAt: Math.floor(now / 1000) + 3 * 24 * 3600,
          },
        ],
        mucDung: {
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
