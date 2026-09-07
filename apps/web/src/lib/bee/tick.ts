import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { composeFlowSteps, readFlow } from "./flow-fs";
import { getBee } from "./index";
import { readQueue, writeQueue } from "./queue-fs";
import { runOneTick } from "./queue-run";
import { openSession } from "./session-ctl";

/**
 * One Autopilot tick, wired to disk and systemd.
 *
 * It lives here because there are TWO callers and there may be only ONE copy
 * of the rule: `bee-tick.timer` hits `/api/tick` every 30 minutes, and the
 * "Run now" button calls it directly when somebody does not want to wait. Let
 * each side do its own wiring and they drift apart at the worst possible
 * moment — one honouring the quota brake, the other not.
 *
 * The pure rule stays in `queue-run.ts`; this file only injects side effects.
 *
 * There is no time window here and never was: Autopilot runs at any hour.
 * "Leave it overnight" is a story in the PRD, not a schedule.
 */

export interface QueueTickResult {
  opened: string | null;
  reason: string;
}

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

export async function runQueueTick(): Promise<QueueTickResult> {
  const baseDir = root();
  const q = await readQueue(baseDir);
  // Empty queue: touch nothing else. A tick with no work should be cheap.
  if (q.items.length === 0) return { opened: null, reason: "the queue is empty" };

  const paused = await fs
    .access(path.join(baseDir, "PAUSE"))
    .then(() => true)
    .catch(() => false);
  const session = await getBee().listSessions();

  const res = await runOneTick({
    queue: q,
    paused,
    runningCount: session.filter((p) => p.status === "running" || p.status === "starting").length,
    maxParallel: Number(process.env.QUEUE_MAX_PARALLEL ?? 1),
    openSession: async (v) => {
      const daCo = session.filter((p) => p.slug === v.slug).length;
      // flow.json (Setup): thứ tự /lệnh Autopilot tự đi qua sau khi mở phiên —
      // xem session-run.sh cho phần "gửi bước kế khi bước trước xong".
      const flow = await readFlow(baseDir);
      const flowSteps = await composeFlowSteps(flow.steps);
      return openSession({
        slug: v.slug,
        num: daCo + 1,
        repo: v.repo,
        title: `#${v.issue}`,
        worktree: true,
        mode: v.mode,
        // Work that may run with nobody watching: tell the agent which issue
        // it is on, the flow it will move through on its own, and how to
        // signal "a human needs to look at this" instead of guessing forever.
        systemPrompt:
          `You are working on issue #${v.issue} of ${v.repo}. Read the issue with gh, ` +
          `follow its acceptance criteria. You will be walked through this flow, one turn ` +
          `each: ${flow.steps.map((s) => `/${s}`).join(" → ")}. Move to the next step ` +
          `yourself once you're done with the current one — do not wait for anyone. If at ` +
          `any point you cannot proceed with confidence (something only a human can decide, ` +
          `or a check you cannot pass), end your final message for that step with a line ` +
          `starting exactly with "FLOW_BLOCKED: " followed by a short reason, so a human can ` +
          `pick up from there.`,
        flowSteps,
      });
    },
    writer: (latest) => writeQueue(baseDir, latest),
  });

  return { opened: res.opened === null ? null : `${res.opened.repo}#${res.opened.issue}`, reason: res.reason };
}
