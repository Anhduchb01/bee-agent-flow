import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

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
  const goc = root();
  const q = await readQueue(goc);
  // Empty queue: touch nothing else. A tick with no work should be cheap.
  if (q.items.length === 0) return { opened: null, reason: "the queue is empty" };

  const paused = await fs
    .access(path.join(goc, "PAUSE"))
    .then(() => true)
    .catch(() => false);
  const phien = await getBee().listSessions();

  const kq = await runOneTick({
    queue: q,
    paused,
    runningCount: phien.filter((p) => p.status === "running" || p.status === "starting").length,
    maxParallel: Number(process.env.QUEUE_MAX_PARALLEL ?? 1),
    openSession: async (v) => {
      const daCo = phien.filter((p) => p.slug === v.slug).length;
      return openSession({
        slug: v.slug,
        num: daCo + 1,
        repo: v.repo,
        title: `#${v.issue}`,
        worktree: true,
        mode: v.mode,
        // Work that may run with nobody watching: tell the agent which issue
        // it is on instead of making it guess from the session title.
        systemPrompt: `You are working on issue #${v.issue} of ${v.repo}. Read the issue with gh, follow its acceptance criteria, then open a PR with the bee-push-pr skill.`,
      });
    },
    ghi: (moi) => writeQueue(goc, moi),
  });

  return { opened: kq.opened === null ? null : `${kq.opened.repo}#${kq.opened.issue}`, reason: kq.reason };
}
