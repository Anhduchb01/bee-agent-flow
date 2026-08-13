import { cn } from "@/lib/utils";

import type { Health } from "../lib/derive";

const TONE: Record<Health["level"], string> = {
  ok: "border-border bg-card",
  warn: "border-amber-500/40 bg-amber-500/5",
  down: "border-destructive/50 bg-destructive/5",
};

const DOT: Record<Health["level"], string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  down: "bg-destructive",
};

function Con({ nhan, gia }: { nhan: string; gia: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{nhan}</span>
      <span className="font-mono text-sm tabular-nums">{gia}</span>
    </div>
  );
}

/**
 * Dải sức khoẻ hệ thống. Thuần trình bày — mọi quyết định nằm ở `deriveHealth`,
 * nên chúng test được mà không phải dựng DOM.
 */
export function SystemHealth({ health }: { health: Health }) {
  return (
    <section
      aria-label="Sức khoẻ hệ thống"
      className={cn("rounded-lg border px-4 py-3", TONE[health.level])}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[health.level])}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{health.headline}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{health.detail}</p>

          {health.slots ? (
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
              <Con
                nhan="Slot build"
                gia={`${health.slots.build.used}/${health.slots.build.max}`}
              />
              <Con
                nhan="Slot bằng chứng"
                gia={`${health.slots.evidence.used}/${health.slots.evidence.max}`}
              />
              <Con nhan="Đang chạy" gia={String(health.running)} />
              <Con nhan="Hàng đợi" gia={String(health.queued)} />
            </div>
          ) : null}

          {health.dropped > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {health.dropped} mục trong status.json sai hình dạng và đã bị bỏ qua. Kiểu
              trong <code>lib/bee/types.ts</code> có thể đã lệch với reconciler.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
