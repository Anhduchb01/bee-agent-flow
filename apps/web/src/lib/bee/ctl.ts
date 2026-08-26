import "server-only";

import {
  execFile,
  spawn,
  type ChildProcess,
  type ExecFileOptions,
  type SpawnOptions,
} from "node:child_process";
import { promisify } from "node:util";

/**
 * The ONE door every outside command goes through — systemctl, gh, loginctl,
 * tok, the pty flows. Nothing in lib/bee calls execFile or spawn directly.
 *
 * Why a door at all (V3.T18, found 25/08): the bee machine's journal had
 * three `bee-session@cc000000-…0001.service` units go through failed — uuids
 * lifted straight out of a test fixture. `session-brake.test.ts` sets
 * BEE_SOURCE=disk to exercise the disk branch, and that branch really does
 * `systemctl --user start`. The comment in that test ASSUMED "systemctl is
 * absent in the sandbox", which is exactly wrong on the one machine where
 * tests matter most: there `bee-session@.service` is a static unit, so start
 * works. It was harmless that day (the unit died instantly on a missing
 * session.json), but it is a live path from `pnpm test` into a running
 * session.
 *
 * So: don't hope the binary is missing. Close the door and make it say so.
 * `BEE_CTL=none` refuses every outside command with a plain Error — the same
 * shape callers already handle when a command fails — and vitest.setup.ts
 * sets it for the whole suite, so a test has to opt IN to touching the
 * machine rather than opt out.
 */

export type { ChildProcess };

const runExec = promisify(execFile);

/** `false` when BEE_CTL=none — every command below refuses instead of running. */
export function ctlEnabled(): boolean {
  return process.env.BEE_CTL !== "none";
}

function refusal(cmd: string, args: string[]): Error {
  return new Error(`BEE_CTL=none — refused to run outside command: ${cmd} ${args.join(" ")}`);
}

/** execFile, gated. Same resolved shape callers already destructure. */
export function ctl(
  cmd: string,
  args: string[],
  options?: ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  if (!ctlEnabled()) return Promise.reject(refusal(cmd, args));
  // No encoding option here: execFile already defaults to utf8, and casting
  // once at the door is cheaper than making every caller narrow Buffer|string.
  return runExec(cmd, args, options) as Promise<{ stdout: string; stderr: string }>;
}

/** spawn, gated. Throws rather than returning a dead child: a caller that
 *  wires up stdin/stdout on a fake would hang instead of failing. */
export function ctlSpawn(cmd: string, args: string[], options?: SpawnOptions): ChildProcess {
  if (!ctlEnabled()) throw refusal(cmd, args);
  return spawn(cmd, args, options ?? {});
}
