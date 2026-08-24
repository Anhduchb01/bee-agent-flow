import { CAC_LANE, MOTA_LANE, NHAN_LANE, nhomTheoLane, type MucBang } from "../lib/lanes";
import { LinkPR, PhienGan, SoIssue } from "./issue-bits";

/**
 * Kanban view — the same four lanes as the lane rules, in lifecycle order.
 * The board scrolls sideways on a phone (one column ≈ one screen width,
 * snapped) instead of squeezing four unreadable columns onto 390px.
 */
export function BoardKanban({ muc }: { muc: MucBang[] }) {
  const theoLane = nhomTheoLane(muc);
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {CAC_LANE.map((lane) => (
        <section
          key={lane}
          aria-label={NHAN_LANE[lane]}
          className="flex w-[85vw] shrink-0 snap-start flex-col gap-2 sm:w-72"
        >
          <header className="flex flex-col gap-0.5">
            <h2 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
              {NHAN_LANE[lane]}
              <span className="font-mono text-xs text-muted-foreground">
                {theoLane[lane].length}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">{MOTA_LANE[lane]}</p>
          </header>

          <ul className="flex flex-col gap-2">
            {theoLane[lane].map((m) => (
              <li
                key={`${m.repo}#${m.issue.number}`}
                className="flex flex-col gap-2 rounded-card border border-border bg-card p-3"
              >
                <span className="flex items-baseline gap-2">
                  <SoIssue muc={m} />
                  <span className="min-w-0 text-sm text-foreground">{m.issue.title}</span>
                </span>
                <PhienGan phien={m.phien} />
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-muted-foreground">{m.slug}</span>
                  <LinkPR muc={m} />
                </span>
              </li>
            ))}
            {theoLane[lane].length === 0 && (
              <li className="rounded-card border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                Nothing here
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
