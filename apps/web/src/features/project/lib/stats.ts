import type { Stat } from "@/components/stat-grid";

import type { ProjectView } from "../api/load";
import { stageOf } from "@/lib/task-stage";

/** Bốn con số cho danh sách dự án. */
export function thongKeDuAn(projects: ProjectView[]): Stat[] {
  const chuaCaiDat = projects.filter((p) => p.repo === null).length;
  const dangChay = projects.reduce((n, p) => n + p.running.length, 0);
  const hangDoi = projects.reduce((n, p) => n + (p.repo?.queue.length ?? 0), 0);

  return [
    {
      label: "Dự án",
      value: String(projects.length),
      hint:
        chuaCaiDat > 0
          ? `${chuaCaiDat} chưa chạy be repo add`
          : "reconciler đã biết tất cả",
      tone: chuaCaiDat > 0 ? "warn" : undefined,
    },
    { label: "Agent đang làm", value: String(dangChay), hint: "trên toàn bộ dự án" },
    {
      label: "Hàng đợi",
      value: String(hangDoi),
      hint: hangDoi > 0 ? "khớp rule nhưng chưa có slot" : "không có gì chờ slot",
    },
    {
      label: "PR đang mở",
      value: String(projects.reduce((n, p) => n + p.prs.length, 0)),
      hint: "chờ người đọc diff",
    },
  ];
}

/** Bốn con số cho một dự án. */
export function thongKeMotDuAn(project: ProjectView): Stat[] {
  const mo = project.tasks.filter((t) => t.state === "open");
  const canNguoi = mo.filter((t) => stageOf(t) === "can-nguoi").length;
  const choDuyet = mo.filter((t) => stageOf(t) === "cho-duyet").length;

  return [
    { label: "Task mở", value: String(mo.length), hint: "chưa đóng trên GitHub" },
    {
      label: "Agent đang làm",
      value: `${project.running.length}/${project.repo?.wip.max ?? "?"}`,
      hint: `hàng đợi ${project.repo?.queue.length ?? 0}`,
      tone: project.running.length > 0 ? "agent" : undefined,
    },
    {
      label: "Chờ duyệt PR",
      value: String(choDuyet),
      hint: choDuyet > 0 ? "chờ người đọc diff" : "không có PR nào chờ",
    },
    {
      label: "Cần người",
      value: String(canNguoi),
      hint: canNguoi > 0 ? "agent đã dừng" : "không có gì kẹt",
      tone: canNguoi > 0 ? "down" : undefined,
    },
  ];
}
