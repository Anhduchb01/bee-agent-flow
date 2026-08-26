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
  const [session, skills, slice] = await Promise.all([
    loadSession(id),
    getBee().listCommands(),
    readSessionSlice(id),
  ]);
  if (!session) notFound();

  return (
    <div className="flex h-dvh flex-col">
      <PageHeader title={session.title ?? `${session.slug}-${session.num}`} />
      <LiveView session={session} commands={skills} slice={slice} />
    </div>
  );
}
