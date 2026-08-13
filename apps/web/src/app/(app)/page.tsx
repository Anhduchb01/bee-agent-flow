import { PageTitle } from "@/components/page-title";
import { deriveHealth, SystemHealth } from "@/features/health";
import { InboxList, loadInbox } from "@/features/inbox";
import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";

export default async function HopThuPage() {
  const actor = await getActor();
  if (!actor) return null;

  const [items, statusRead] = await Promise.all([loadInbox(actor), getBee().readStatus()]);
  const health = deriveHealth(statusRead);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageTitle
        title="Đang chờ bạn"
        hint={
          items.length === 0
            ? "Không có việc nào đang chặn ở bạn."
            : `${items.length} việc đang chặn ở bạn, xếp theo thời gian đã chờ.`
        }
      />
      <SystemHealth health={health} />
      <InboxList items={items} />
    </main>
  );
}
