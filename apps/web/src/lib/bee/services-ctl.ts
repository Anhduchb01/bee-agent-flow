import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { ctl } from "./ctl";
import { readSlices } from "./services-fs";

/**
 * Owning the shared pool from the web: read it, change it, turn it on and off.
 *
 * Before this (T15c) the pool was read-only on screen and the owner was told
 * to go edit `services/compose.yml` on the machine over SSH — which is a
 * strange thing to say in a product whose whole point is that you should not
 * have to.
 *
 * Two asymmetries drive the design:
 *
 *   - **Saving is cheap to undo, starting is not.** A compose file that does
 *     not parse takes the pool down, and every session that needs a pooled
 *     service is then REFUSED at the gate. So the file is validated before it
 *     replaces the old one, and a rejected save leaves the old one alone.
 *   - **Off is the dangerous direction.** Stopping the pool while a session
 *     holds a slice of it deletes that session's database out from under a
 *     running agent. On is harmless; off asks first.
 */

export type Result = { ok: true } | { ok: false; message: string };

const MAX_BYTES = 64 * 1024;
const UNIT = "bee-services.service";

const STARTER = `# Services every session on this machine can share.
#
# bee reads the IMAGE to decide what it can carve per session: a database and
# role for postgres/mysql, a vhost and user for rabbitmq, a bucket and key for
# minio. An image it cannot place still runs — each session just brings its
# own copy instead of sharing this one.
services: {}
`;

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

function isFixture(): boolean {
  return process.env.BEE_SOURCE !== "disk";
}

function composePath(): string {
  return path.join(root(), "services", "compose.yml");
}

export interface PoolCompose {
  text: string;
  /** `false` when the machine has no pool file yet — the text is a starting point. */
  exists: boolean;
}

export async function readPoolCompose(): Promise<PoolCompose> {
  if (isFixture()) {
    return {
      text: "services:\n  postgres:\n    image: postgres:16\n",
      exists: true,
    };
  }
  try {
    return { text: await fs.readFile(composePath(), "utf8"), exists: true };
  } catch {
    return { text: STARTER, exists: false };
  }
}

/**
 * The service names declared at the top level of a compose file.
 *
 * Deliberately not a YAML parser: adding a dependency to answer "is there a
 * services block, and what is in it" would be a poor trade, and the real
 * validator is `docker compose config` below — the program that will actually
 * read this file. This is the floor that works even where docker does not.
 */
export function serviceNames(text: string): string[] {
  const lines = text.split("\n");
  const head = lines.findIndex((l) => /^services:\s*(\{\s*\}\s*)?$/.test(l));
  if (head === -1) return [];
  const names: string[] = [];
  let indent = -1;
  for (const line of lines.slice(head + 1)) {
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    if (/^\S/.test(line)) break; // next top-level key ends the block
    const m = /^(\s+)([A-Za-z0-9_.-]+):/.exec(line);
    if (!m) continue;
    if (indent === -1) indent = m[1].length;
    if (m[1].length === indent) names.push(m[2]);
  }
  return names;
}

function hasServicesKey(text: string): boolean {
  return text.split("\n").some((l) => /^services:\s*(\{\s*\}\s*)?$/.test(l));
}

/**
 * `docker compose config` on a throwaway copy — the only check that agrees
 * with the program that will run the file. Absent docker (or a closed ctl
 * door) this cannot answer, and "cannot answer" is not "invalid": the
 * structural check above already refused the shapes we can be sure about.
 */
async function dockerAccepts(text: string): Promise<Result> {
  const probe = path.join(root(), "services", `.compose.check.${process.pid}.yml`);
  try {
    await fs.writeFile(probe, text);
    await ctl("docker", ["compose", "-f", probe, "config", "-q"]);
    return { ok: true };
  } catch (e) {
    const err = e as { stderr?: string; message?: string; code?: unknown };
    const said = (err.stderr ?? err.message ?? "").toString().trim();
    // Docker missing, or the door closed: not a verdict on the file.
    if (/not found|ENOENT|BEE_CTL/i.test(said) || said === "") return { ok: true };
    return { ok: false, message: `docker compose rejected it: ${said.split("\n")[0]}` };
  } finally {
    await fs.rm(probe, { force: true });
  }
}

export async function savePoolCompose(text: string): Promise<Result> {
  if (Buffer.byteLength(text) > MAX_BYTES) {
    return { ok: false, message: "Too large — this file names services, it does not carry data." };
  }
  if (!hasServicesKey(text)) {
    return {
      ok: false,
      message: "No top-level `services:` block — a compose file without one shares nothing.",
    };
  }
  if (isFixture()) return { ok: true };

  const verdict = await dockerAccepts(text);
  if (!verdict.ok) return verdict;

  const file = composePath();
  const tmp = `${file}.tmp`;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(tmp, text);
    await fs.rename(tmp, file);
    return { ok: true };
  } catch (e) {
    await fs.rm(tmp, { force: true });
    return { ok: false, message: `Could not save: ${(e as Error).message}` };
  }
}

/** Sessions currently holding a slice carved out of the pool. */
async function holders(): Promise<string[]> {
  const slices = await readSlices();
  return slices.filter((s) => s.items.some((i) => i.in_pool)).map((s) => s.sessionId);
}

export async function setPoolRunning(on: boolean, opts?: { force?: boolean }): Promise<Result> {
  if (on) {
    const { text } = await readPoolCompose();
    if (serviceNames(text).length === 0) {
      return {
        ok: false,
        message: "No service declared — bringing the unit up with nothing to run says nothing.",
      };
    }
  } else if (opts?.force !== true) {
    // A slice IS the session's database. Stopping the pool takes it away from
    // an agent that is mid-run and will simply start failing.
    const held = await holders();
    if (held.length > 0) {
      return {
        ok: false,
        message:
          `${held.length} session${held.length === 1 ? "" : "s"} still holds a slice of this pool` +
          ` — stopping now takes their database away mid-run. Close them, or stop anyway.`,
      };
    }
  }

  if (isFixture()) return { ok: true };
  try {
    await ctl("systemctl", ["--user", on ? "start" : "stop", UNIT]);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `systemctl ${on ? "start" : "stop"} failed: ${(e as Error).message}` };
  }
}

/** Whether the pool unit is up right now. Unknown is reported, never guessed. */
export async function poolRunning(): Promise<boolean | null> {
  if (isFixture()) return true;
  try {
    const { stdout } = await ctl("systemctl", ["--user", "is-active", UNIT]);
    return stdout.trim() === "active";
  } catch (e) {
    // `is-active` exits non-zero for inactive — that is an answer, not a fault.
    const out = (e as { stdout?: string }).stdout?.trim();
    if (out === "inactive" || out === "failed") return false;
    return null;
  }
}
