import { notFound } from "next/navigation";

import { LiveView, loadSession } from "@/features/sessions";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";
import { readSessionSlice } from "@/lib/bee/services-fs";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return null;

  const { id } = await params;
  const [phien, skills, slice] = await Promise.all([
    loadSession(id),
    getBee().listCommands(),
    readSessionSlice(id),
  ]);
  if (!phien) notFound();

  return (
    <div className="flex h-dvh flex-col">
      <PageHeader title={phien.title ?? `${phien.slug}-${phien.num}`} />
      <LiveView phien={phien} commands={skills} slice={slice} />
    </div>
  );
}
