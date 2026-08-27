import {
  BoardKanban,
  BoardTable,
  BoardToolbar,
  loadBoard,
  filterByProject,
  type BoardView,
} from "@/features/board";
import { NewProjectDialog } from "@/features/setup";
import { PageHeader } from "@/features/shell";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { getActor } from "@/lib/auth";

/**
 * Project board: every issue of every registered repo, and the session that
 * worked on it. GitHub owns the issues, bee owns the issue↔session link —
 * this page is the only place the two are shown together.
 *
 * Filter and view live in the URL (`?p=<slug>&view=kanban`), so the sidebar
 * can link straight into one project's board and a phone needs no client
 * state to switch.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor) return null;

  const { p, view } = await searchParams;
  const sidebarProjects = typeof p === "string" && p !== "" ? p : null;
  const boardView: BoardView = view === "kanban" ? "kanban" : "table";

  const { row, repos, err, queue } = await loadBoard();
  const shown = filterByProject(row, sidebarProjects);
  const isOpen = shown.filter((m) => m.issue.state === "OPEN").length;

  return (
    <>
      <PageHeader
        title="Projects"
        meta={
          <span className="font-mono text-xs text-muted-foreground">
            {isOpen} open · {shown.length} issues
          </span>
        }
      >
        <NewProjectDialog trigger={<Button size="sm">New project</Button>} />
      </PageHeader>

      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <BoardToolbar
          repos={repos}
          sidebarProjects={sidebarProjects}
          view={boardView}
          queuedCount={queue.items.filter((v) => v.status === "waiting").length}
        />

        {err.map((l) => (
          <p key={l.repo} className="text-xs text-destructive">
            {l.message}
          </p>
        ))}

        {shown.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No issues here</EmptyTitle>
              <EmptyDescription>
                {repos.length === 0
                  ? "No repo is registered yet — add the first one above."
                  : sidebarProjects === null
                    ? "Ask a session to open one: say what you want, then tap Issue."
                    : `${sidebarProjects} has no issues yet.`}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : boardView === "kanban" ? (
          <BoardKanban row={shown} />
        ) : (
          <BoardTable row={shown} />
        )}
      </div>
    </>
  );
}
