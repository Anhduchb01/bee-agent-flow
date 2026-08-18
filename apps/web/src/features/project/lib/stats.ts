import type { Stat } from "@/components/stat-grid";

import type { ProjectView } from "../api/load";

/** Ba con số cho danh sách dự án. */
export function thongKeDuAn(projects: ProjectView[]): Stat[] {
  const chuaCaiDat = projects.filter((p) => p.repo === null).length;
  const dangChay = projects.reduce((n, p) => n + p.running.length, 0);

  return [
    {
      label: "Projects",
      value: String(projects.length),
      hint:
        chuaCaiDat > 0
          ? `${chuaCaiDat} missing be repo add`
          : "the runner knows them all",
      tone: chuaCaiDat > 0 ? "warn" : undefined,
    },
    { label: "Agents working", value: String(dangChay), hint: "across all projects" },
    {
      label: "Open PRs",
      value: String(projects.reduce((n, p) => n + p.prs.length, 0)),
      hint: "waiting for someone to read the diff",
    },
  ];
}

/** Ba con số cho một dự án. */
export function thongKeMotDuAn(project: ProjectView): Stat[] {
  const mo = project.tasks.filter((t) => t.state === "open");

  return [
    { label: "Open tasks", value: String(mo.length), hint: "not closed on GitHub" },
    {
      label: "Agents working",
      value: String(project.running.length),
      hint: "on this project",
      tone: project.running.length > 0 ? "agent" : undefined,
    },
    {
      label: "Open PRs",
      value: String(project.prs.length),
      hint:
        project.prs.length > 0 ? "waiting for someone to read the diff" : "no PR waiting",
    },
  ];
}
