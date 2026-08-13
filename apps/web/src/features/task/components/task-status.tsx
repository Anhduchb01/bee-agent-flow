import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { BeeRunning } from "@/lib/bee/types";
import { khoangThoiGian } from "@/lib/duration";
import type { GhTask } from "@/lib/github/types";
import { cn } from "@/lib/utils";

const CHECK_TONE: Record<string, string> = {
  success: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  failure: "border-destructive/40 text-destructive",
  pending: "border-amber-500/40 text-amber-700 dark:text-amber-500",
  neutral: "",
};

const CHECK_LABEL: Record<string, string> = {
  success: "xanh",
  failure: "đỏ",
  pending: "đang chạy",
  neutral: "không kết luận",
};

function Dong({ nhan, children }: { nhan: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{nhan}</span>
      {children}
    </div>
  );
}

/**
 * Trạng thái của task: nhãn, `bee/test`, approvals, link PR.
 *
 * **Không có nút merge ở đây, và sẽ không bao giờ có.** Merge xảy ra trên
 * GitHub, do người làm, sau khi xem diff. App này không giữ quyền đó.
 */
export function TaskStatus({ task, dangChay }: { task: GhTask; dangChay: BeeRunning | null }) {
  const approvals = task.pull?.reviews.filter((r) => r.state === "APPROVED") ?? [];

  return (
    <div className="divide-y rounded-lg border px-4">
      <Dong nhan="Nhãn">
        {task.labels.length === 0 ? (
          <span className="text-muted-foreground">chưa có</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {task.labels.map((l) => (
              <Badge key={l} variant="outline" className="font-mono text-xs">
                {l}
              </Badge>
            ))}
          </div>
        )}
      </Dong>

      <Dong nhan="Agent">
        {dangChay ? (
          <span>
            đang chạy <code className="text-xs">{dangChay.rule}</code> ·{" "}
            {khoangThoiGian(dangChay.elapsed_s)}
          </span>
        ) : (
          <span className="text-muted-foreground">không có việc nào đang chạy</span>
        )}
      </Dong>

      {task.pull ? (
        <>
          <Dong nhan="Pull request">
            <a
              href={task.pull.url}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              #{task.pull.number} trên GitHub
            </a>
            {task.pull.draft ? <Badge variant="outline">nháp</Badge> : null}
            <code className="text-xs text-muted-foreground">{task.pull.head_sha}</code>
          </Dong>

          <Dong nhan="bee/test">
            {task.pull.checks.length === 0 ? (
              <span className="text-muted-foreground">chưa chạy</span>
            ) : (
              task.pull.checks.map((c) => (
                <Badge key={c.name} variant="outline" className={CHECK_TONE[c.conclusion]}>
                  {c.name} · {CHECK_LABEL[c.conclusion] ?? c.conclusion}
                </Badge>
              ))
            )}
          </Dong>

          <Dong nhan="Đã duyệt">
            {approvals.length === 0 ? (
              <span className="text-muted-foreground">chưa ai duyệt</span>
            ) : (
              approvals.map((r) => (
                <Badge key={r.author.login} variant="outline">
                  {r.author.name}
                </Badge>
              ))
            )}
          </Dong>
        </>
      ) : (
        <Dong nhan="Pull request">
          <span className="text-muted-foreground">chưa có</span>
        </Dong>
      )}
    </div>
  );
}
