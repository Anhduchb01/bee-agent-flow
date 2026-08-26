import Link from "next/link";

import { RunNowButton } from "./autopilot-controls";

/**
 * Filter + view switch, built from LINKS, not client state: the board is a
 * server component, so a phone gets a plain navigation instead of shipping
 * a store. Every combination is a real URL you can bookmark or share, and
 * that is also what the sidebar's project rows link into.
 */

export type BoardView = "table" | "kanban";

export function boardHref(slug: string | null, view: BoardView): string {
  const q = new URLSearchParams();
  if (slug !== null) q.set("p", slug);
  if (view !== "table") q.set("view", view);
  const s = q.toString();
  return s === "" ? "/projects" : `/projects?${s}`;
}

function Chip({
  href,
  selected,
  children,
}: {
  href: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      // min-h-9: a filter you cannot hit with a thumb is not a filter.
      className={`flex min-h-9 shrink-0 items-center rounded-full border px-3 text-xs ${
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-body hover:bg-muted"
      }`}
    >
      {children}
    </Link>
  );
}

export function BoardToolbar({
  repos,
  duAn,
  view,
  queuedCount,
}: {
  repos: { slug: string; repo: string }[];
  duAn: string | null;
  view: BoardView;
  /** Items waiting in Autopilot — at 0 "Run now" has nothing to run. */
  queuedCount: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <nav
        aria-label="Filter by project"
        className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Chip href={boardHref(null, view)} selected={duAn === null}>
          All projects
        </Chip>
        {repos.map((r) => (
          <Chip key={r.slug} href={boardHref(r.slug, view)} selected={duAn === r.slug}>
            {r.slug}
          </Chip>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="View" className="flex gap-1.5">
          <Chip href={boardHref(duAn, "table")} selected={view === "table"}>
            Table
          </Chip>
          <Chip href={boardHref(duAn, "kanban")} selected={view === "kanban"}>
            Kanban
          </Chip>
        </nav>
        {/* In the toolbar rather than on the Autopilot lane: that lane only
            exists in Kanban, and Table is the default — a button inside a tab
            nobody opened may as well not exist. */}
        <RunNowButton queued={queuedCount} />
      </div>
    </div>
  );
}
