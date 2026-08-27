import "server-only";

import { getBee } from "@/lib/bee";
import type { StatusRead } from "@/lib/bee/types";
import { getClaude, type ClaudeSnapshot } from "@/lib/claude";

import { lastSevenDays, sevenDaySummary, type RunDay } from "../lib/seven-days";

export interface DashboardView {
  statusRead: StatusRead;
  claude: ClaudeSnapshot;
  sevenDay: RunDay[];
  sevenDaySummary: string | null;
  /** Mốc đọc dữ liệu — đồng hồ đếm ngược tính từ đây, không từ lúc render. */
  readAt: number;
}

export async function loadDashboard(): Promise<DashboardView> {
  const [statusRead, claude, recent] = await Promise.all([
    getBee().readStatus(),
    getClaude().read(),
    getBee().readRecent(500),
  ]);

  const days = lastSevenDays(recent);

  return {
    statusRead,
    claude,
    sevenDay: days,
    sevenDaySummary: sevenDaySummary(days),
    readAt: Date.now(),
  };
}
