import Link from "next/link";

/**
 * Filter + view switch, built from LINKS, not client state: the board is a
 * server component, so a phone gets a plain navigation instead of shipping
 * a store. Every combination is a real URL you can bookmark or share, and
 * that is also what the sidebar's project rows link into.
 */

export type ChoXem = "table" | "kanban";

export function duongDanBang(slug: string | null, view: ChoXem): string {
  const q = new URLSearchParams();
  if (slug !== null) q.set("p", slug);
  if (view !== "table") q.set("view", view);
  const s = q.toString();
  return s === "" ? "/projects" : `/projects?${s}`;
}

function Chip({
  href,
  dangChon,
  children,
}: {
  href: string;
  dangChon: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={dangChon ? "page" : undefined}
      // min-h-9: a filter you cannot hit with a thumb is not a filter.
      className={`flex min-h-9 shrink-0 items-center rounded-full border px-3 text-xs ${
        dangChon
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
}: {
  repos: { slug: string; repo: string }[];
  duAn: string | null;
  view: ChoXem;
}) {
  return (
    <div className="flex flex-col gap-2">
      <nav
        aria-label="Filter by project"
        className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Chip href={duongDanBang(null, view)} dangChon={duAn === null}>
          All projects
        </Chip>
        {repos.map((r) => (
          <Chip key={r.slug} href={duongDanBang(r.slug, view)} dangChon={duAn === r.slug}>
            {r.slug}
          </Chip>
        ))}
      </nav>

      <nav aria-label="View" className="flex gap-1.5">
        <Chip href={duongDanBang(duAn, "table")} dangChon={view === "table"}>
          Table
        </Chip>
        <Chip href={duongDanBang(duAn, "kanban")} dangChon={view === "kanban"}>
          Kanban
        </Chip>
      </nav>
    </div>
  );
}
