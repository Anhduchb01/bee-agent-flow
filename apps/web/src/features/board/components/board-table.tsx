import { NHAN_LANE, type MucBang } from "../lib/lanes";
import { NutXepHang } from "./autopilot-controls";
import { LinkPR, PhienGan, SoIssue } from "./issue-bits";

/**
 * Table view. Not a <table>: on a phone a real table means horizontal
 * scrolling, and this screen is phone-first (PRD §4.1). Each issue is one
 * stacked block that becomes a column layout from `sm` up, so the same
 * markup reads as a list on a thumb and as a table on a desk.
 */
export function BoardTable({ muc }: { muc: MucBang[] }) {
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
        {muc.map((m) => (
          <li
            key={`${m.repo}#${m.issue.number}`}
            className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:grid sm:grid-cols-[minmax(0,1fr)_180px_200px_110px_44px] sm:items-center sm:gap-4"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-baseline gap-2">
                <SoIssue muc={m} />
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

            <PhienGan phien={m.phien} />

            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-xs text-muted-foreground">{m.slug}</span>
              <LinkPR muc={m} />
            </span>

            <span className="text-xs text-body">
              {NHAN_LANE[m.lane]}
              {m.hangDoi?.status === "waiting" && (
                <span className="ml-1 font-mono text-muted-foreground">
                  #{muc.indexOf(m) + 1}
                </span>
              )}
            </span>
            <NutXepHang muc={m} />
          </li>
        ))}
      </ul>
    </div>
  );
}
