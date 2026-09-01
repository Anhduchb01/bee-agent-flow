import Link from "next/link";

import { StatusDot, type Tone } from "@/components/status-dot";
import type { BeeSession } from "@/lib/bee/types";

import type { BoardRow, IssueSession } from "../lib/lanes";

/**
 * Shared row pieces — the table and the kanban must speak the same language.
 *
 * Every link here is one line of 13px mono: 17px tall, and on a phone the
 * rows stack so they sit a few pixels apart. `pointer-coarse:min-h-11`
 * gives each one a fingertip of its own; the row grows on touch and stays
 * dense on the desk.
 */

const TONE_PHIEN: Record<BeeSession["status"], Tone> = {
  running: "agent",
  starting: "idle",
  done: "ok",
  stopped: "idle",
  failed: "down",
};

/**
 * The link this board exists for: issue → the session that worked on it.
 * Rendered as real links so a thumb can hit them; "—" when nothing picked
 * the issue up, which is information, not an empty cell.
 */
export function AttachedSession({ session }: { session: IssueSession[] }) {
  if (session.length === 0) {
    return <span className="text-xs text-muted-foreground">no session yet</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {session.map((p) => (
        <Link
          key={p.id}
          href={`/sessions/${p.id}`}
          className="flex items-center gap-1.5 font-mono text-xs text-body hover:underline pointer-coarse:min-h-11"
        >
          <StatusDot tone={p.needs_human ? "down" : TONE_PHIEN[p.status]} />
          {p.branch}
          {p.needs_human ? <span className="text-destructive">needs you</span> : null}
        </Link>
      ))}
    </span>
  );
}

/**
 * nowrap + shrink-0: the arrow used to fall to its own line beside a long
 * title on a phone, costing a whole line and reading as broken markup.
 */
export function SoIssue({ row }: { row: BoardRow }) {
  return (
    <a
      href={row.issue.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center whitespace-nowrap font-mono text-xs text-muted-foreground hover:underline pointer-coarse:min-h-11"
    >
      #{row.issue.number} ↗
    </a>
  );
}

export function LinkPR({ row }: { row: BoardRow }) {
  if (row.pr.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {row.pr.map((pr) => (
        <Link
          key={pr.url}
          href={pr.number === null ? pr.url : `/pr/${row.slug}/${pr.number}`}
          className="inline-flex items-center font-mono text-xs text-body hover:underline pointer-coarse:min-h-11"
        >
          PR #{pr.number ?? "?"}
        </Link>
      ))}
    </span>
  );
}
