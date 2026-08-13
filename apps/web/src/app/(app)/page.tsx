import { deriveHealth, SystemHealth } from "@/features/health";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";

export default async function TongQuanPage() {
  const actor = await getActor();
  if (!actor) return null;

  const health = deriveHealth(await getBee().readStatus());

  return (
    <>
      <PageHeader title="Tổng quan" />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <SystemHealth health={health} />
      </div>
    </>
  );
}
