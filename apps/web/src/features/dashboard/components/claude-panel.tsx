import { StatusDot, type Tone } from "@/components/status-dot";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ClaudeSnapshot, HanMuc } from "@/lib/claude";
import { khoangThoiGian } from "@/lib/duration";
import { cn } from "@/lib/utils";

const CUA_SO: Record<HanMuc["cuaSo"], string> = {
  five_hour: "5-hour limit",
  weekly: "Weekly limit",
};

const TRANG_THAI: Record<HanMuc["trangThai"], Tone> = {
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
function mauThanh(h: HanMuc): string {
  if (h.trangThai === "exceeded" || (h.phanTram ?? 0) >= 95)
    return "[&_[data-slot=progress-indicator]]:bg-destructive";
  if (h.trangThai === "warning" || (h.phanTram ?? 0) >= 75)
    return "[&_[data-slot=progress-indicator]]:bg-warning";
  return "[&_[data-slot=progress-indicator]]:bg-link";
}

function O({
  nhan,
  children,
  className,
}: {
  nhan: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 px-5 py-4", className)}>
      <span className="eyebrow">{nhan}</span>
      {children}
    </div>
  );
}

function ThanhHanMuc({ hanMuc, now }: { hanMuc: HanMuc; now: number }) {
  const conLai = Math.max(0, hanMuc.resetsAt * 1000 - now) / 1000;

  return (
    <>
      <div className="flex items-baseline gap-2">
        <StatusDot tone={TRANG_THAI[hanMuc.trangThai]} />
        <span className="font-mono text-2xl leading-none tabular-nums tracking-title text-foreground">
          {hanMuc.phanTram === null ? "—" : `${hanMuc.phanTram}%`}
        </span>
        <span className="text-xs text-muted-foreground">
          new window in {khoangThoiGian(conLai)}
        </span>
      </div>

      <Progress
        value={hanMuc.phanTram ?? 0}
        aria-label={CUA_SO[hanMuc.cuaSo]}
        className={cn("[&_[data-slot=progress-track]]:h-2", mauThanh(hanMuc))}
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
  const { hanMuc, mucDung, dichVu } = snapshot;
  const dichVuTone: Tone = dichVu.indicator === "none" ? "ok" : "down";

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b bg-muted/30 px-5 py-3.5">
        <CardTitle className="text-base tracking-title">Claude</CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <StatusDot tone={dichVuTone} />
          {dichVu.moTa}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-0 px-0 sm:grid-cols-2">
        {hanMuc.map((h, i) => (
          <O
            key={h.cuaSo}
            nhan={CUA_SO[h.cuaSo]}
            className={i > 0 ? "border-t sm:border-t-0 sm:border-l" : undefined}
          >
            <ThanhHanMuc hanMuc={h} now={now} />
          </O>
        ))}

        <O nhan="Tokens today" className="border-t">
          <span className="font-mono text-2xl leading-none tabular-nums tracking-title text-foreground">
            {(mucDung.token / 1_000_000).toFixed(2)}
            <span className="text-sm"> M</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {Math.round(mucDung.tiLeCache * 100)}% read from cache · {mucDung.soLanChay} runs
          </span>
        </O>

        <O nhan="Cost today" className="border-t sm:border-l">
          <span className="font-mono text-2xl leading-none tabular-nums tracking-title text-foreground">
            ${mucDung.chiPhiHomNay.toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">
            seven days: ${mucDung.chiPhiBayNgay.toFixed(2)}
          </span>
        </O>
      </CardContent>
    </Card>
  );
}
