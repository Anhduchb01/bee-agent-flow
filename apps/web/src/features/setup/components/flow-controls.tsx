"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { KNOWN_FLOW_STEPS, type FlowStep } from "@/lib/bee/types";

import { saveFlowAction } from "../api/actions";

/**
 * Autopilot flow: thứ tự /lệnh một phiên tự đi qua sau khi mở, không cần ai
 * bấm Build rồi Review rồi PR. Mỗi nút bấm là một lần lưu — cùng nhịp
 * "bấm là xong" của ReorderButtons/QueueButton bên board, không có nút Save
 * riêng để quên bấm.
 */

const NUT =
  "flex size-9 items-center justify-center rounded-control border border-border text-xs text-body hover:bg-accent disabled:opacity-40 pointer-coarse:size-11";

function swap(steps: FlowStep[], i: number, j: number): FlowStep[] {
  const next = [...steps];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function FlowControls({ steps }: { steps: FlowStep[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState("");

  function save(next: FlowStep[]) {
    start(async () => {
      const outcome = await saveFlowAction(next);
      setErr(outcome.ok ? "" : outcome.message);
      router.refresh();
    });
  }

  const unused = KNOWN_FLOW_STEPS.filter((s) => !steps.includes(s));

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-foreground">Autopilot flow</h3>
        <p className="text-xs text-muted-foreground">
          After Autopilot opens a session for a queued issue, it walks through these on its
          own, one turn each — no one has to click Build, then Review, then PR. It stops and
          flags the session for a human the moment a step can&apos;t proceed with confidence.
        </p>
      </div>

      {steps.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Empty — an Autopilot session opens and then waits for a human to say the first thing.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {steps.map((step, i) => (
            <li
              key={step}
              className="flex items-center gap-2 rounded-control border border-border px-2.5 py-1.5"
            >
              <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>
              <span className="flex-1 font-mono text-sm text-body">/{step}</span>
              <button
                type="button"
                className={NUT}
                disabled={busy || i === 0}
                aria-label={`Move /${step} earlier`}
                onClick={() => save(swap(steps, i, i - 1))}
              >
                ↑
              </button>
              <button
                type="button"
                className={NUT}
                disabled={busy || i === steps.length - 1}
                aria-label={`Move /${step} later`}
                onClick={() => save(swap(steps, i, i + 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className={NUT}
                disabled={busy}
                aria-label={`Remove /${step} from the flow`}
                onClick={() => save(steps.filter((_, j) => j !== i))}
              >
                −
              </button>
            </li>
          ))}
        </ol>
      )}

      {unused.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unused.map((step) => (
            <button
              key={step}
              type="button"
              disabled={busy}
              aria-label={`Add /${step} to the flow`}
              className="flex h-9 items-center rounded-control border border-border px-3 font-mono text-xs text-body hover:bg-accent disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:px-4"
              onClick={() => save([...steps, step])}
            >
              + /{step}
            </button>
          ))}
        </div>
      )}

      {err !== "" && (
        <p className="text-xs text-destructive" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
