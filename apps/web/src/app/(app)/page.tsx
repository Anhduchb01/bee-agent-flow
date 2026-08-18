import Link from "next/link";

import { Eyebrow } from "@/components/eyebrow";
import { StatusDot } from "@/components/status-dot";
import { ClaudePanel, loadDashboard, SevenDaysChart } from "@/features/dashboard";
import { deriveHealth, SystemHealth } from "@/features/health";
import { loadSessions } from "@/features/sessions";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

export default async function TongQuanPage() {
  const actor = await getActor();
  if (!actor) return null;

  const [view, nhom] = await Promise.all([loadDashboard(), loadSessions()]);
  const health = deriveHealth(view.statusRead);

  const active = nhom.flatMap((g) =>
    g.phien
      .filter((p) => p.status === "running" || p.status === "starting")
      .map((p) => ({ ...p, repoLabel: g.repo })),
  );

  return (
    <>
      <PageHeader title="Overview" />

      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <SystemHealth health={health} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <ClaudePanel snapshot={view.claude} now={view.readAt} />

          <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-5">
            <Eyebrow>Active sessions</Eyebrow>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions running.</p>
            ) : (
              <ul className="flex flex-col">
                {active.map((p) => (
                  <li key={p.id} className="border-b border-border last:border-b-0">
                    <Link
                      href={`/sessions/${p.id}`}
                      className="flex items-center gap-3 py-2.5 text-sm hover:underline underline-offset-4"
                    >
                      <StatusDot tone={p.status === "running" ? "agent" : "idle"} />
                      <span className="truncate font-medium tracking-title text-foreground">
                        {p.title ?? p.id}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                        {p.repoLabel}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <SevenDaysChart days={view.bayNgay} tomTat={view.tomTatBayNgay} />
      </div>
    </>
  );
}
