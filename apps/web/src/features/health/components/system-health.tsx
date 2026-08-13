import { StatusDot, type Tone } from "@/components/status-dot";
import { cn } from "@/lib/utils";

import type { Health } from "../lib/derive";

/**
 * Dải sức khoẻ hệ thống. Thuần trình bày — mọi quyết định nằm ở `deriveHealth`,
 * nên chúng test được mà không phải dựng DOM.
 *
 * **Khi mọi thứ bình thường nó co lại thành một dòng.** Chiếm bốn ô số ở đầu
 * mọi màn hình để nói "không có gì xảy ra" là lấy mất chỗ của thông tin thật.
 * Nó chỉ nở ra thành một thẻ khi có chuyện — và lúc đó thì nó *nên* to.
 *
 * Màu ở đây chỉ sống trong một chấm 6px và một đường viền 1px.
 */
const TONE: Record<Health["level"], Tone> = { ok: "ok", warn: "warn", down: "down" };

const VIEN: Record<Health["level"], string> = {
  ok: "border-border",
  warn: "border-warning/40",
  down: "border-destructive/40",
};

function tomTatMay(health: Health): string | null {
  if (!health.slots) return null;
  return [
    `build ${health.slots.build.used}/${health.slots.build.max}`,
    `evidence ${health.slots.evidence.used}/${health.slots.evidence.max}`,
    `${health.queued} queued`,
  ].join(" · ");
}

export function SystemHealth({ health }: { health: Health }) {
  const tomTat = tomTatMay(health);

  if (health.level === "ok") {
    return (
      <section
        aria-label="System health"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
      >
        <StatusDot tone="ok" />
        <span className="text-body">{health.headline}</span>
        {tomTat ? (
          <span className="font-mono text-xs text-muted-foreground">{tomTat}</span>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-label="System health"
      className={cn("rounded-card border bg-card px-5 py-4", VIEN[health.level])}
    >
      <div className="flex items-start gap-2.5">
        <StatusDot tone={TONE[health.level]} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium tracking-title",
              health.level === "down" ? "text-destructive" : "text-foreground",
            )}
          >
            {health.headline}
          </p>
          <p className="mt-1 text-sm text-body">{health.detail}</p>

          {tomTat ? (
            <p className="mt-3 font-mono text-xs text-muted-foreground">{tomTat}</p>
          ) : null}

          {health.dropped > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {health.dropped} entries in status.json had the wrong shape and were dropped. The
              types in <code>lib/bee/types.ts</code> may have drifted from the reconciler.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
