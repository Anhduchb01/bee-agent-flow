import { LANE_LABEL, type BoardRow } from "../lib/lanes";
import { QueueButton } from "./autopilot-controls";
import { LinkPR, AttachedSession, SoIssue } from "./issue-bits";

/**
 * Table view. Not a <table>: on a phone a real table means horizontal
 * scrolling, and this screen is phone-first (PRD §4.1). Each issue is one
 * stacked block that becomes a column layout from `sm` up, so the same
 * markup reads as a list on a thumb and as a table on a desk.
 */
export function BoardTable({ row }: { row: BoardRow[] }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="hidden border-b border-border px-4 py-2 text-xs text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_180px_200px_110px_44px] sm:gap-4">
        <span>Issue</span>
        <span>Session</span>
        <span>Project · PR</span>
        <span>Lane</span>
        <span className="sr-only">Autopilot</span>
      </div>
      <ul>
        {row.map((m) => (
          <li
            key={`${m.repo}#${m.issue.number}`}
            className="flex flex-col gap-1.5 border-b border-border px-4 py-2.5 last:border-b-0 sm:grid sm:grid-cols-[minmax(0,1fr)_180px_200px_110px_44px] sm:items-center sm:gap-4"
          >
            {/*
              Two wrappers that vanish from `sm` up (`sm:contents`), so one
              markup reads as two lines on a thumb and as five columns on a
              desk. Measured at 390px before this: each issue took ~200px with
              session, project and lane as three unlabelled bare lines — four
              issues filled the screen and you had to guess which line was
              which. Now the meta sits on one line where the grouping says it.
            */}
            <span className="flex min-w-0 items-start gap-2 sm:contents">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-baseline gap-2">
                  <SoIssue row={m} />
                  <span className="min-w-0 truncate text-sm text-foreground">{m.issue.title}</span>
                </span>
                {m.issue.labels.length > 0 && (
                  <span className="flex flex-wrap gap-1.5">
                    {m.issue.labels.map((l) => (
                      <span
                        key={l}
                        className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {l}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {/* On a phone the queue button rides line 1; on a desk it is the
                  last column, so its grid order is set explicitly. */}
              <span className="shrink-0 sm:order-last">
                <QueueButton row={m} />
              </span>
            </span>

            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:contents">
              {/* Lane leads on a phone — it is the answer to "where is this?" —
                  but stays the fourth column on a desk. */}
              <span className="order-first text-xs text-body sm:order-none">
                {LANE_LABEL[m.lane]}
                {m.queue?.status === "waiting" && (
                  <span className="ml-1 font-mono text-muted-foreground">
                    #{row.indexOf(m) + 1}
                  </span>
                )}
              </span>
              <span aria-hidden className="order-first text-muted-foreground sm:hidden">
                ·
              </span>
              <AttachedSession session={m.session} />
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-xs text-muted-foreground">{m.slug}</span>
                <LinkPR row={m} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
