import "server-only";

import { getBee } from "@/lib/bee";
import type { StatusRead } from "@/lib/bee/types";
import { getClaude, type ClaudeSnapshot } from "@/lib/claude";

import { bayNgayQua, tomTatBayNgay, type NgayChay } from "../lib/seven-days";

export interface DashboardView {
  statusRead: StatusRead;
  claude: ClaudeSnapshot;
  bayNgay: NgayChay[];
  tomTatBayNgay: string | null;
  /** Mốc đọc dữ liệu — đồng hồ đếm ngược tính từ đây, không từ lúc render. */
  readAt: number;
}

export async function loadDashboard(): Promise<DashboardView> {
  const [statusRead, claude, recent] = await Promise.all([
    getBee().readStatus(),
    getClaude().read(),
    getBee().readRecent(500),
  ]);

  const days = bayNgayQua(recent);

  return {
    statusRead,
    claude,
    bayNgay: days,
    tomTatBayNgay: tomTatBayNgay(days),
    readAt: Date.now(),
  };
}
