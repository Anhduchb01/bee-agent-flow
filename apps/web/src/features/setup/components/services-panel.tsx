import { StatusDot } from "@/components/status-dot";

import type { BeePoolService, BeeSlice } from "@/lib/bee/services-fs";

/**
 * The shared service pool, and the slices currently carved out of it (T15c2,
 * T15c3).
 *
 * The row that matters most is the one with an EMPTY kind. bee guesses what a
 * pooled service is from its image; an image it cannot place still works, but
 * every session then runs its OWN copy instead of sharing this one — RAM
 * leaves and nobody is told. This panel is one of the two places (doctor is
 * the other) where that stops being silent.
 */

const KIND_LABEL: Record<string, string> = {
  postgres: "database + role per session",
  mysql: "database + user per session",
  rabbitmq: "vhost + user per session",
  redis: "cheap — sessions run their own",
  s3: "bucket + key per session",
};

export function ServicesPanel({ pool, slices }: { pool: BeePoolService[]; slices: BeeSlice[] }) {
  const unplaceable = pool.filter((p) => p.kind === "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-medium text-foreground">Shared pool</h3>
          <span className="font-mono text-xs text-muted-foreground">
            {pool.length} service{pool.length === 1 ? "" : "s"}
          </span>
        </div>

        {pool.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No pool configured. Every session runs all of its own services — fine until two
            sessions want the same database at once. Add services to{" "}
            <span className="font-mono">services/compose.yml</span> on the machine, then start{" "}
            <span className="font-mono">bee-services</span>.
          </p>
        ) : (
          <ul aria-label="Pool services" className="flex flex-col gap-1.5">
            {pool.map((p) => (
              <li key={p.service} className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
                <StatusDot tone={p.kind === "" ? "warn" : "ok"} />
                <span className="text-foreground">{p.service}</span>
                <span className="text-muted-foreground">{p.image}</span>
                <span className="flex-1" />
                {p.kind === "" ? (
                  <span className="text-warning">bee cannot place this image</span>
                ) : (
                  <span className="text-body">{KIND_LABEL[p.kind] ?? p.kind}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {unplaceable.length > 0 && (
          <p className="rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            bee guesses what a service is from its image, and it cannot place{" "}
            <span className="font-mono">{unplaceable.map((p) => p.image).join(", ")}</span>. Sessions
            that need it will run their own copy instead of sharing this one. Rename to a
            standard image (postgres, rabbitmq, minio/minio, mysql) to share it — or leave it,
            and expect the memory.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-medium text-foreground">Slices in use</h3>
          <span className="font-mono text-xs text-muted-foreground">{slices.length}</span>
        </div>
        {slices.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No session holds a slice right now.
          </p>
        ) : (
          <ul aria-label="Slices in use" className="flex flex-col gap-1.5">
            {slices.map((s) => (
              <li key={s.sessionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
                <span className="text-foreground">{s.slice}</span>
                <span className="text-muted-foreground">
                  {s.items.filter((i) => i.in_pool).map((i) => i.kind).join(" · ") || "nothing shared"}
                </span>
                <span className="flex-1" />
                <span className="text-muted-foreground">{s.sessionId.slice(0, 8)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          A slice lives as long as its worktree. gc gives both back together — count a merged PR
          keeps its database for at least another day, and a session waiting on you keeps it
          until you look.
        </p>
      </div>
    </div>
  );
}
