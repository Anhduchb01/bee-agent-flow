import Link from "next/link";

import { StatusDot, type Tone } from "@/components/status-dot";
import type { BeeSession } from "@/lib/bee/types";

import type { MucBang, PhienCuaIssue } from "../lib/lanes";

/** Shared row pieces — the table and the kanban must speak the same language. */

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
export function PhienGan({ phien }: { phien: PhienCuaIssue[] }) {
  if (phien.length === 0) {
    return <span className="text-xs text-muted-foreground">no session yet</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {phien.map((p) => (
        <Link
          key={p.id}
          href={`/sessions/${p.id}`}
          className="flex items-center gap-1.5 font-mono text-xs text-body hover:underline"
        >
          <StatusDot tone={p.needs_human ? "down" : TONE_PHIEN[p.status]} />
          {p.branch}
          {p.needs_human ? <span className="text-destructive">needs you</span> : null}
        </Link>
      ))}
    </span>
  );
}

export function SoIssue({ muc }: { muc: MucBang }) {
  return (
    <a
      href={muc.issue.url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-muted-foreground hover:underline"
    >
      #{muc.issue.number} ↗
    </a>
  );
}

export function LinkPR({ muc }: { muc: MucBang }) {
  if (muc.pr.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {muc.pr.map((pr) => (
        <Link
          key={pr.url}
          href={pr.number === null ? pr.url : `/pr/${muc.slug}/${pr.number}`}
          className="font-mono text-xs text-body hover:underline"
        >
          PR #{pr.number ?? "?"}
        </Link>
      ))}
    </span>
  );
}
