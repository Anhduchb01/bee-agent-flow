import Link from "next/link";

import { StatusDot, type Tone } from "@/components/status-dot";
import type { BeeSession, TrangThaiPhien } from "@/lib/bee/types";

import type { NhomPhien } from "../api/load";

/**
 * Danh sách phiên nhóm theo repo — màn hình gốc của app. Mỗi dòng là một
 * phiên; `needs_human` nổi đỏ tại chỗ. Rỗng-vì-chưa-có-phiên là trạng thái
 * TỐT và phải trông như vậy, không phải như lỗi.
 */

const TONE: Record<TrangThaiPhien, Tone> = {
  running: "agent",
  starting: "idle",
  done: "ok",
  stopped: "idle",
  failed: "down",
};

const NHAN: Record<TrangThaiPhien, string> = {
  running: "running",
  starting: "starting",
  done: "done",
  stopped: "stopped",
  failed: "failed",
};

export function SessionList({ nhom }: { nhom: NhomPhien[] }) {
  if (nhom.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No sessions yet. Start one above — describe an idea and the agent will interview you.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {nhom.map(({ repo, phien }) => (
        <section key={repo} className="flex flex-col gap-2">
          <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{repo}</h2>
          <ul className="rounded-card border border-border bg-card">
            {phien.map((p) => (
              <MotDong key={p.id} p={p} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MotDong({ p }: { p: BeeSession }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        href={`/sessions/${p.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/50"
      >
        <StatusDot tone={p.needs_human ? "down" : TONE[p.status]} />
        <span className="min-w-0 flex-1 truncate text-body">
          {p.title ?? `${p.slug}-${p.num}`}
        </span>
        {p.needs_human && (
          <span className="font-mono text-xs text-destructive">needs you</span>
        )}
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          bee/{p.slug}-{p.num}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{NHAN[p.status]}</span>
      </Link>
    </li>
  );
}
