import { PageTitle } from "@/components/page-title";
import { StatGrid } from "@/components/stat-grid";
import { deriveHealth, SystemHealth } from "@/features/health";
import { loadInbox, TaskTable, thongKeViec } from "@/features/inbox";
import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";

export default async function ViecCuaBanPage() {
  const actor = await getActor();
  if (!actor) return null;

  const [items, statusRead] = await Promise.all([loadInbox(actor), getBee().readStatus()]);
  const health = deriveHealth(statusRead);

  return (
    <main className="mx-auto flex w-full max-w-[88rem] flex-col gap-6 px-4 py-10 sm:px-6">
      <PageTitle
        title="Việc của bạn"
        hint={
          items.length === 0
            ? "Không có việc nào đang chặn ở bạn."
            : `${items.length} việc đang chặn ở bạn, xếp theo thời gian đã chờ.`
        }
      />
      <SystemHealth health={health} />
      <StatGrid stats={thongKeViec(items)} />
      <TaskTable items={items} />
    </main>
  );
}
