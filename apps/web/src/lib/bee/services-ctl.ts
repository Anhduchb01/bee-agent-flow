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
#
# Bind to 127.0.0.1 only: this pool is bee's, not the machine's. The published
# port is what sessions are told to dial (BEE_DB_URL, BEE_AMQP_URL, ...), so
# any port works — these are offset to leave the machine's own 5432/5672 free.
#
# To share postgres and rabbitmq, REPLACE the \`services: {}\` line below with
# the block under it (uncommented) — a file with two \`services:\` keys is not
# valid YAML. Then Save, then Start.
services: {}

#services:
#  postgres:
#    image: postgres:16
#    restart: unless-stopped
#    environment:
#      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-bee}
#    ports: ["127.0.0.1:55432:5432"]
#    volumes: ["pgdata:/var/lib/postgresql/data"]
#    healthcheck:
#      test: ["CMD-SHELL", "pg_isready -U postgres"]
#      interval: 10s
#
#  rabbitmq:
#    image: rabbitmq:3-management
#    restart: unless-stopped
#    environment:
#      RABBITMQ_DEFAULT_USER: \${RABBITMQ_DEFAULT_USER:-bee}
#      RABBITMQ_DEFAULT_PASS: \${RABBITMQ_DEFAULT_PASS:-bee}
#    ports:
#      - "127.0.0.1:55672:5672"      # AMQP - the only port sessions need
#      # The management console is for a HUMAN, not for sessions, so it is off
#      # by default: 15672 is commonly already taken, and one port in use
#      # fails the whole \`compose up\`. Uncomment on a port you know is free.
#      # - "127.0.0.1:55673:15672"
#    volumes: ["rabbitdata:/var/lib/rabbitmq"]
#    healthcheck:
#      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
#      interval: 15s
#
#volumes:
#  pgdata:
#  rabbitdata:
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

/**
 * Turn a unit's journal tail into one sentence the owner can act on.
 *
 * systemd's own answer — "the control process exited with error code, see
 * journalctl" — is a receipt, not a reason: it tells the owner to go find out
 * for themselves, on a machine the whole product exists so they need not open.
 * The reason is always right there in the journal; this lifts it out.
 *
 * Deliberately quotes docker rather than paraphrasing it. "port is already
 * allocated" naming 55432 is worth more than any sentence written here, and a
 * paraphrase would go stale the first time docker changes its wording.
 */
/**
 * Every host port this compose file claims.
 *
 * `docker compose up` is not atomic: on 27/08 postgres came up, rabbitmq hit
 * a port already in use, and the unit ended failed with half a pool running.
 * Knowing the ports up front turns that into a refusal naming the port.
 *
 * The IP is full of digits, so a spec is split rather than pattern-matched:
 * "127.0.0.1:55432:5432" would otherwise report a host port of 1.
 */
export function composePorts(text: string): number[] {
  const found: number[] = [];
  for (const raw of text.split("\n")) {
    if (!/^\s+(ports:|-)/.test(raw)) continue;
    for (const spec of raw.replace(/^\s+ports:/, "").split(/[[\],"'\s]+/)) {
      const part = spec.split(":");
      // ip:host:container or host:container. A bare port publishes nothing.
      if (part.length < 2) continue;
      const host = Number(part[part.length - 2]);
      if (Number.isInteger(host) && host > 0 && !found.includes(host)) found.push(host);
    }
  }
  return found;
}

/** Which of these ports something is already listening on. */
async function portsInUse(ports: number[]): Promise<number[]> {
  if (ports.length === 0) return [];
  try {
    const { stdout } = await ctl("ss", ["-ltn"]);
    return ports.filter((p) => new RegExp(`[:.]${p}\\s`).test(stdout));
  } catch {
    // No `ss`, or the door is closed: cannot answer, so do not block a start.
    return [];
  }
}

export function explainUnitFailure(journal: string): string {
  const lines = journal
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    // systemd's bookkeeping about its own state — the owner has already seen
    // that much, and it never says why.
    .filter((l) => !/^\S*bee-services\.service:|^(Starting|Started|Stopping|Stopped) /.test(l))
    .filter((l) => !/Main process exited|Failed with result|Scheduled restart|Consumed [0-9]/.test(l));

  const docker = lines.find((l) => /Cannot connect to the Docker daemon|permission denied.*docker\.sock/i.test(l));
  if (docker !== undefined) {
    return (
      `${docker} — rootless docker is not reachable from the unit. ` +
      "Check `systemctl --user status docker` on the machine."
    );
  }

  const loud = lines.filter((l) =>
    /error|err:|denied|refused|invalid|cannot|no such|already allocated|did not find|yaml|unauthorized/i.test(l),
  );
  const pick = (loud.length > 0 ? loud : lines).slice(-2);
  if (pick.length === 0) {
    return "The unit failed and its journal said nothing usable — `journalctl --user -xeu bee-services`.";
  }
  return pick.join(" · ");
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
    // Only while it is DOWN: a running pool holds its own ports, and calling
    // that a clash would refuse every idempotent Start.
    if (opts?.force !== true && (await poolRunning()) === false) {
      const taken = await portsInUse(composePorts(text));
      if (taken.length > 0) {
        return {
          ok: false,
          message:
            `Port ${taken.join(", ")} already in use on this machine. ` +
            "`docker compose up` is not atomic — starting now brings up the services " +
            "before it and leaves the pool half up. Change the port, or start anyway.",
        };
      }
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
    return { ok: false, message: `Could not ${on ? "start" : "stop"} it: ${await whyUnitFailed(e as Error)}` };
  }
}

/** The unit's own last words, or systemctl's if the journal is unreachable. */
async function whyUnitFailed(fallback: Error): Promise<string> {
  try {
    const { stdout } = await ctl("journalctl", [
      "--user", "-u", UNIT, "-n", "40", "--no-pager", "-o", "cat",
    ]);
    const said = explainUnitFailure(stdout);
    if (said !== "") return said;
  } catch {
    // No journalctl, or the door is closed — fall through to systemctl's text.
  }
  return fallback.message.replace(/^Command failed: \S+ /, "");
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
