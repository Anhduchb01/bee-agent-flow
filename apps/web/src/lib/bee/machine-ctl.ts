import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Machine-level controls for the setup screen. Same discipline as
 * session-ctl: fixed unit names only — nothing user-typed ever reaches
 * systemctl — and failures come back as data, not exceptions.
 */

const run = promisify(execFile);

export type KetQua = { ok: true } | { ok: false; message: string };

function isFixture(): boolean {
  return process.env.BEE_SOURCE !== "disk";
}

/**
 * Re-run the A+ hygiene checklist. The unit is oneshot, so `systemctl start`
 * blocks until doctor.sh finished writing doctor.json — the page can reload
 * fresh results immediately. doctor.sh exits 1 when checks fail, which
 * systemd reports as a start error; that is still a SUCCESSFUL run for us
 * (the red results are in doctor.json), so only a missing unit is an error.
 */
export async function runDoctor(): Promise<KetQua> {
  if (isFixture()) return { ok: true };
  try {
    await run("systemctl", ["--user", "start", "bee-doctor.service"]);
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    // Exit 1 from doctor.sh = checks failed but doctor.json was written.
    if (/control process exited|code=exited|exit code 1/i.test(msg)) return { ok: true };
    return { ok: false, message: `Could not run doctor: ${msg}` };
  }
}
