import { loadSessions, NewSessionForm, SessionList } from "@/features/sessions";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

export default async function SessionsPage() {
  const actor = await getActor();
  if (!actor) return null;

  const nhom = await loadSessions();
  const tongPhien = nhom.reduce((n, g) => n + g.phien.length, 0);

  return (
    <>
      <PageHeader
        title="Sessions"
        meta={
          <span className="font-mono text-xs text-muted-foreground">{tongPhien} sessions</span>
        }
      />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <NewSessionForm />
        <SessionList nhom={nhom} />
      </div>
    </>
  );
}
