import { StatusDot, type Tone } from "@/components/status-dot";
import { buttonVariants } from "@/components/ui/button";
import type { BeeRunning } from "@/lib/bee/types";
import { khoangThoiGian } from "@/lib/duration";
import type { CheckConclusion, GhTask } from "@/lib/github/types";
import { cn } from "@/lib/utils";

const CHECK_TONE: Record<CheckConclusion, Tone> = {
  success: "ok",
  failure: "down",
  pending: "warn",
  neutral: "idle",
};

const CHECK_LABEL: Record<CheckConclusion, string> = {
  success: "xanh",
  failure: "red",
  pending: "running",
  neutral: "inconclusive",
};

function Dong({ nhan, children }: { nhan: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-5 py-3 text-sm last:border-b-0">
      <span className="eyebrow w-32 shrink-0">{nhan}</span>
      {children}
    </div>
  );
}

/** Thẻ mã: nhãn, rule, SHA đều là định danh kỹ thuật, nên chúng đặt bằng mono. */
function Ma({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-control border border-border bg-muted px-1.5 py-0.5 text-xs text-body">
      {children}
    </code>
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
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <Dong nhan="Labels">
        {task.labels.length === 0 ? (
          <span className="text-muted-foreground">none</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {task.labels.map((l) => (
              <Ma key={l}>{l}</Ma>
            ))}
          </div>
        )}
      </Dong>

      <Dong nhan="Agent">
        {dangChay ? (
          <span className="flex items-center gap-2 text-body">
            <StatusDot tone="agent" />
            running <Ma>{dangChay.rule}</Ma>
            <span className="font-mono text-xs tabular-nums">
              {khoangThoiGian(dangChay.elapsed_s)}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">nothing running</span>
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
              #{task.pull.number} on GitHub
            </a>
            {task.pull.draft ? (
              <span className="eyebrow rounded-pill border border-border px-2 py-0.5">
                draft
              </span>
            ) : null}
            <code className="font-mono text-xs text-muted-foreground">
              {task.pull.head_sha}
            </code>
          </Dong>

          <Dong nhan="bee/test">
            {task.pull.checks.length === 0 ? (
              <span className="text-muted-foreground">not run</span>
            ) : (
              task.pull.checks.map((c) => (
                <span key={c.name} className="flex items-center gap-1.5 text-body">
                  <StatusDot tone={CHECK_TONE[c.conclusion]} />
                  <span className="font-mono text-xs">
                    {c.name} · {CHECK_LABEL[c.conclusion] ?? c.conclusion}
                  </span>
                </span>
              ))
            )}
          </Dong>

          <Dong nhan="Approved">
            {approvals.length === 0 ? (
              <span className="text-muted-foreground">nobody has approved</span>
            ) : (
              approvals.map((r) => (
                <span
                  key={r.author.login}
                  className="flex items-center gap-1.5 text-body"
                >
                  <StatusDot tone="ok" />
                  {r.author.name}
                </span>
              ))
            )}
          </Dong>
        </>
      ) : (
        <Dong nhan="Pull request">
          <span className="text-muted-foreground">none</span>
        </Dong>
      )}
    </div>
  );
}
