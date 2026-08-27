"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Eyebrow } from "@/components/eyebrow";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import type { BeePreviewLive } from "@/lib/bee/machine-ctl";

import { stopPreviewAction } from "../api/actions";

/**
 * Live previews the bee-preview skill started (V2.3): tap the link to
 * test the PR's code from any tailnet device, Stop kills the transient
 * unit AND releases the tailscale serve port. Rendered only when
 * something is actually running — an empty card is noise.
 */
export function PreviewsCard({ previews }: { previews: BeePreviewLive[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  if (previews.length === 0) return null;

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-5">
      <Eyebrow>Live previews</Eyebrow>
      <ul className="flex flex-col">
        {previews.map((p) => (
          <li
            key={p.unit}
            className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
          >
            <StatusDot tone="agent" />
            <span className="min-w-0 flex-1 truncate">
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                {p.slug} <span className="font-mono text-xs text-muted-foreground">:{p.port} ↗</span>
              </a>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const outcome = await stopPreviewAction(p.unit, p.port);
                  setErr(outcome.ok ? "" : outcome.message);
                  router.refresh();
                })
              }
            >
              Stop
            </Button>
          </li>
        ))}
      </ul>
      {err !== "" && <p className="text-xs text-destructive">{err}</p>}
    </section>
  );
}
