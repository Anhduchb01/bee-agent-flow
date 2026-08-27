import { StatusDot, type Tone } from "@/components/status-dot";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ClaudeSnapshot, Quota } from "@/lib/claude";
import { humanDuration } from "@/lib/duration";
import { cn } from "@/lib/utils";

import { RefreshUsageButton } from "./refresh-usage-button";

const CUA_SO: Record<Quota["usageWindow"], string> = {
  five_hour: "5-hour limit",
  weekly: "Weekly limit",
};

const TRANG_THAI: Record<Quota["status"], Tone> = {
  allowed: "ok",
  warning: "warn",
  exceeded: "down",
};

/**
 * Thanh đổi màu theo mức, không đổi theo ý thích: xanh → cam → đỏ.
 *
 * Tô qua `[&_[data-slot=…]]` chứ không truyền `ProgressIndicator` làm con:
 * `Progress` của shadcn luôn nối thêm một `ProgressTrack` của riêng nó **sau**
 * `children`, nên truyền track vào sẽ ra hai thanh chồng nhau — thanh của mình
 * đúng màu và một thanh `bg-primary` đen ngay dưới, trông như một chỉ số thứ
 * hai không ai giải thích được.
 */
function barColour(h: Quota): string {
  if (h.status === "exceeded" || (h.percentOf ?? 0) >= 95)
    return "[&_[data-slot=progress-indicator]]:bg-destructive";
  if (h.status === "warning" || (h.percentOf ?? 0) >= 75)
    return "[&_[data-slot=progress-indicator]]:bg-warning";
  return "[&_[data-slot=progress-indicator]]:bg-link";
}

function O({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 px-5 py-4", className)}>
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}

function QuotaBar({ quota, now }: { quota: Quota; now: number }) {
  const rest =
    quota.resetsAt === null ? null : Math.max(0, quota.resetsAt * 1000 - now) / 1000;

  return (
    <>
      <div className="flex items-baseline gap-2">
        <StatusDot tone={TRANG_THAI[quota.status]} />
        <span className="font-mono text-2xl leading-none tabular-nums tracking-title text-foreground">
          {quota.percentOf === null ? "—" : `${quota.percentOf}%`}
        </span>
        {rest !== null && (
          <span className="text-xs text-muted-foreground">
            new window in {humanDuration(rest)}
          </span>
        )}
      </div>

      <Progress
        value={quota.percentOf ?? 0}
        aria-label={CUA_SO[quota.usageWindow]}
        className={cn("[&_[data-slot=progress-track]]:h-2", barColour(quota))}
      />
    </>
  );
}

/**
 * Mức dùng và trạng thái của Claude.
 *
 * Đặt cạnh "Máy đang làm" vì hai khối cùng trả lời một câu: *máy có làm được
 * việc không*. Hết hạn mức và hết slot build đều dẫn tới cùng một hệ quả —
 * không có gì chạy — nên chúng phải đọc được trong một lượt mắt.
 */
export function ClaudePanel({ snapshot, now }: { snapshot: ClaudeSnapshot; now: number }) {
  const { quota, toolUse, service } = snapshot;
  const serviceTone: Tone = service.indicator === "none" ? "ok" : "down";

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b bg-muted/30 px-5 py-3.5">
        <CardTitle className="flex items-center text-base tracking-title">
          Claude
          <span className="ml-auto">
            <RefreshUsageButton />
          </span>
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <StatusDot tone={serviceTone} />
          {service.hint}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-0 px-0 sm:grid-cols-2">
        {quota.map((h, i) => (
          <O
            key={h.usageWindow}
            label={CUA_SO[h.usageWindow]}
            className={i > 0 ? "border-t sm:border-t-0 sm:border-l" : undefined}
          >
            <QuotaBar quota={h} now={now} />
          </O>
        ))}

        <O label="Tokens today" className="border-t">
          <span className="font-mono text-2xl leading-none tabular-nums tracking-title text-foreground">
            {(toolUse.token / 1_000_000).toFixed(2)}
            <span className="text-sm"> M</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {Math.round(toolUse.cacheRate * 100)}% read from cache · {toolUse.runCount} runs
          </span>
        </O>

        <O label="Cost today" className="border-t sm:border-l">
          <span className="font-mono text-2xl leading-none tabular-nums tracking-title text-foreground">
            ${toolUse.costToday.toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">
            seven days: ${toolUse.costSevenDays.toFixed(2)}
          </span>
        </O>
      </CardContent>
    </Card>
  );
}
