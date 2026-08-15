import { Eyebrow } from "@/components/eyebrow";
import type { BeeRun } from "@/lib/bee/types";

/**
 * Lịch sử agent đã chạy cho task này.
 *
 * Nó trả lời câu hỏi mà dòng thời gian comment không trả lời được: task này đã
 * được thử mấy lần, lần nào đổ, và đổ ở rule nào. Một task ba lần `07-build`
 * rồi mới `ok` là một task có vấn đề, dù kết quả cuối cùng vẫn xanh.
 */
const MAU: Record<string, string> = {
  ok: "text-success",
  recovered: "text-warning",
  fail: "text-destructive",
  "gave-up": "text-destructive",
};

function batGiay(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

export function RunList({ runs }: { runs: BeeRun[] }) {
  if (runs.length === 0) {
    return (
      <section className="flex flex-col gap-4 border-t border-border pt-9">
        <Eyebrow>Agent runs</Eyebrow>
        <p className="text-sm text-muted-foreground">
          The agent has not run on this task yet. Runs recorded before this dashboard kept them are
          not shown — only the summary line in the activity chart.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-9">
      <Eyebrow>Agent runs</Eyebrow>
      <ul className="flex flex-col gap-2">
        {runs.map((r) => (
          <li
            key={r.dir}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-card border border-border bg-card px-4 py-3 text-sm"
          >
            <span className="font-mono text-xs text-muted-foreground">#{r.number}</span>
            <span className="font-medium text-foreground">{r.rule}</span>
            <span className={MAU[r.result] ?? "text-body"}>{r.result}</span>
            <span className="text-muted-foreground">
              {r.turns} turn · {batGiay(r.duration_s)}
            </span>
            <time className="ml-auto text-xs text-muted-foreground" dateTime={r.at}>
              {r.at.replace("T", " ").replace("Z", "")}
            </time>
            {/* Không có phiên nghĩa là rule đó không gọi model (rule 03 chạy CI).
                Nói ra, vì "không hỏi được" và "hỏi mà im" là hai chuyện khác. */}
            {r.session_id ? null : (
              <span className="w-full text-xs text-muted-foreground">no model call</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
