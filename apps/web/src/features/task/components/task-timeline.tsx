import { StatusDot } from "@/components/status-dot";
import type { GhComment } from "@/lib/github/types";

/** Bỏ dấu mà rule 08/02 chèn vào đầu comment để nhận ra bài của agent. */
const AGENT_MARK = /^<!--\s*agent-run\s*-->\s*/;

/**
 * Comment của người và của agent, **xen kẽ theo thứ tự thật**.
 *
 * Không tách thành hai cột hay hai tab: cuộc trao đổi này là một mạch, và việc
 * tách nó ra buộc người đọc tự ghép lại theo mốc thời gian trong đầu.
 */
export function TaskTimeline({ comments }: { comments: GhComment[] }) {
  if (comments.length === 0) {
    return (
      <p className="text-sm text-body">
        Chưa có trao đổi nào. Agent sẽ ghi kết quả vào đây ở tick sau.
      </p>
    );
  }

  return (
    <ol aria-label="Dòng thời gian" className="flex flex-col gap-6">
      {[...comments]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => (
          <li key={c.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-medium tracking-title text-foreground">
                {c.author.name}
              </span>
              {c.from_agent ? (
                <span className="flex items-center gap-1.5">
                  <StatusDot tone="agent" />
                  <span className="eyebrow">agent</span>
                </span>
              ) : null}
              {c.kind === "review" ? <span className="eyebrow">trên diff</span> : null}
              <time dateTime={c.created_at} className="text-xs text-muted-foreground">
                {new Date(c.created_at).toLocaleString("vi-VN", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </time>
            </div>
            <p className="text-sm whitespace-pre-wrap text-body">
              {c.body.replace(AGENT_MARK, "")}
            </p>
          </li>
        ))}
    </ol>
  );
}
