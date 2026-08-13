import { StatGrid } from "@/components/stat-grid";
import { loadInbox, TaskTable, thongKeViec } from "@/features/inbox";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

export default async function ViecCuaBanPage() {
  const actor = await getActor();
  if (!actor) return null;

  const items = await loadInbox(actor);

  return (
    <>
      <PageHeader
        title="Your work"
        meta={<span className="font-mono text-xs text-muted-foreground">{items.length} items</span>}
      />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <StatGrid stats={thongKeViec(items)} />
        <TaskTable items={items} />
      </div>
    </>
  );
}
