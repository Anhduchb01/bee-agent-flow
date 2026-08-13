import "server-only";

import { getBee } from "@/lib/bee";
import type { StatusRead } from "@/lib/bee/types";
import { getClaude, type ClaudeSnapshot } from "@/lib/claude";
import { getGithub } from "@/lib/github";

import { honHopDuAn, type HonHopDuAn } from "../lib/project-mix";
import { bayNgayQua, tomTatBayNgay, type NgayChay } from "../lib/seven-days";
import type { ViecDangChay } from "../components/running-panel";

export interface DashboardView {
  statusRead: StatusRead;
  claude: ClaudeSnapshot;
  dangChay: ViecDangChay[];
  slotDung: number;
  slotToiDa: number;
  hangDoi: number;
  duAn: HonHopDuAn[];
  bayNgay: NgayChay[];
  tomTatBayNgay: string | null;
  /** Mốc đọc dữ liệu — đồng hồ đếm ngược tính từ đây, không từ lúc render. */
  readAt: number;
}

export async function loadDashboard(): Promise<DashboardView> {
  const [statusRead, claude, repos, tasks, recent] = await Promise.all([
    getBee().readStatus(),
    getClaude().read(),
    getGithub().listRepos(),
    getGithub().listTasks(),
    getBee().readRecent(500),
  ]);

  const status = statusRead.ok ? statusRead.status : null;

  // Tiêu đề của việc đang chạy không nằm trong status.json — nó chỉ có số hiệu.
  // Ghép sang GitHub để dòng đó đọc được mà không phải mở task.
  const dangChay: ViecDangChay[] = (status?.running ?? []).map((r) => ({
    ...r,
    title: tasks.find((t) => t.slug === r.repo && t.number === r.number)?.title ?? null,
  }));

  const days = bayNgayQua(recent);

  return {
    statusRead,
    claude,
    dangChay,
    slotDung: status?.slots.build.used ?? 0,
    slotToiDa: status?.slots.build.max ?? 0,
    hangDoi: status?.repos.reduce((n, r) => n + r.queue.length, 0) ?? 0,
    duAn: honHopDuAn(
      repos.map((r) => ({
        slug: r.slug,
        full: r.full,
        tasks: tasks.filter((t) => t.slug === r.slug),
      })),
    ),
    bayNgay: days,
    tomTatBayNgay: tomTatBayNgay(days),
    readAt: Date.now(),
  };
}
