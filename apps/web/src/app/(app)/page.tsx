import {
  ClaudePanel,
  loadDashboard,
  ProjectMixPanel,
  RunningPanel,
  SevenDaysChart,
} from "@/features/dashboard";
import { deriveHealth, SystemHealth } from "@/features/health";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

export default async function TongQuanPage() {
  const actor = await getActor();
  if (!actor) return null;

  const view = await loadDashboard();
  const health = deriveHealth(view.statusRead);

  return (
    <>
      <PageHeader title="Tổng quan" />

      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <SystemHealth health={health} />

        {/* Claude và Máy đang làm cạnh nhau: hai khối cùng trả lời một câu —
            máy có làm được việc không. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <ClaudePanel snapshot={view.claude} now={view.readAt} />
          <RunningPanel
            dangChay={view.dangChay}
            slotDung={view.slotDung}
            slotToiDa={view.slotToiDa}
            hangDoi={view.hangDoi}
          />
        </div>

        <ProjectMixPanel duAn={view.duAn} />
        <SevenDaysChart days={view.bayNgay} tomTat={view.tomTatBayNgay} />
      </div>
    </>
  );
}
