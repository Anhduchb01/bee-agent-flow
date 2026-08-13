import { Badge } from "@/components/ui/badge";
import type { GhComment } from "@/lib/github/types";

/** Bỏ dấu mà rule 08/02 chèn vào đầu comment để nhận ra bài của agent. */
const AGENT_MARK = /^<!--\s*agent-run\s*-->\s*/;

function KhoiThoiGian({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="text-xs text-muted-foreground">
      {new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
    </time>
  );
}

/**
 * Comment của người và của agent, **xen kẽ theo thứ tự thật**.
 *
 * Không tách thành hai cột hay hai tab: cuộc trao đổi này là một mạch, và việc
 * tách nó ra buộc người đọc tự ghép lại theo mốc thời gian trong đầu.
 */
export function TaskTimeline({ comments }: { comments: GhComment[] }) {
  if (comments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có trao đổi nào. Agent sẽ ghi kết quả vào đây ở tick sau.
      </p>
    );
  }

  return (
    <ol aria-label="Dòng thời gian" className="flex flex-col gap-5">
      {[...comments]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => (
          <li key={c.id} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{c.author.name}</span>
              {c.from_agent ? (
                <Badge variant="outline" className="border-violet-500/40 text-violet-600 dark:text-violet-400">
                  agent
                </Badge>
              ) : null}
              {c.kind === "review" ? <Badge variant="outline">trên diff</Badge> : null}
              <KhoiThoiGian iso={c.created_at} />
            </div>
            <p className="text-sm whitespace-pre-wrap">{c.body.replace(AGENT_MARK, "")}</p>
          </li>
        ))}
    </ol>
  );
}
