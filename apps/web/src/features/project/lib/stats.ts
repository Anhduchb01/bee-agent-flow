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
      label: "Projects",
      value: String(projects.length),
      hint:
        chuaCaiDat > 0
          ? `${chuaCaiDat} missing be repo add`
          : "the reconciler knows them all",
      tone: chuaCaiDat > 0 ? "warn" : undefined,
    },
    { label: "Agents working", value: String(dangChay), hint: "across all projects" },
    {
      label: "Queued",
      value: String(hangDoi),
      hint: hangDoi > 0 ? "matched a rule, waiting for a slot" : "nothing waiting for a slot",
    },
    {
      label: "Open PRs",
      value: String(projects.reduce((n, p) => n + p.prs.length, 0)),
      hint: "waiting for someone to read the diff",
    },
  ];
}

/** Bốn con số cho một dự án. */
export function thongKeMotDuAn(project: ProjectView): Stat[] {
  const mo = project.tasks.filter((t) => t.state === "open");
  const canNguoi = mo.filter((t) => stageOf(t) === "can-nguoi").length;
  const choDuyet = mo.filter((t) => stageOf(t) === "cho-duyet").length;

  return [
    { label: "Open tasks", value: String(mo.length), hint: "not closed on GitHub" },
    {
      label: "Agents working",
      value: `${project.running.length}/${project.repo?.wip.max ?? "?"}`,
      hint: `${project.repo?.queue.length ?? 0} queued`,
      tone: project.running.length > 0 ? "agent" : undefined,
    },
    {
      label: "PRs to review",
      value: String(choDuyet),
      hint: choDuyet > 0 ? "waiting for someone to read the diff" : "no PR waiting",
    },
    {
      label: "Needs human",
      value: String(canNguoi),
      hint: canNguoi > 0 ? "agent stopped" : "nothing stuck",
      tone: canNguoi > 0 ? "down" : undefined,
    },
  ];
}
