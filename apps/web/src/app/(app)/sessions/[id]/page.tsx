import { notFound } from "next/navigation";

import { LiveView, loadSession } from "@/features/sessions";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return null;

  const { id } = await params;
  const phien = await loadSession(id);
  if (!phien) notFound();

  return (
    <div className="flex h-svh flex-col">
      <PageHeader title={phien.title ?? `${phien.slug}-${phien.num}`} />
      <LiveView phien={phien} />
    </div>
  );
}
