import "server-only";

import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Machine-level controls for the setup screen. Same discipline as
 * session-ctl: fixed unit/command names only — nothing user-typed ever
 * reaches an argv except through an allowlist regex — and failures come
 * back as data, not exceptions.
 */

const run = promisify(execFile);

export type KetQua = { ok: true } | { ok: false; message: string };

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SLUG_RE = /^[a-z0-9-]+$/;

function isFixture(): boolean {
  return process.env.BEE_SOURCE !== "disk";
}

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
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

/** Sessions must survive logout — `loginctl enable-linger` for our own user. */
export async function enableLinger(): Promise<KetQua> {
  if (isFixture()) return { ok: true };
  try {
    await run("loginctl", ["enable-linger"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not enable linger: ${(e as Error).message}` };
  }
}

export { validatePat } from "./pat";
import {
  extractOauthUrl,
  extractSetupToken,
  validateClaudeToken,
  validateSetupCode,
} from "./claude-token";
import { validatePat } from "./pat";

/**
 * Sign gh in with a pasted PAT, then wire git to use it. The token goes in
 * over STDIN — argv would leak it to anyone running `ps`, and logs would
 * keep it forever.
 */
export async function ghAuthLogin(token: string): Promise<KetQua> {
  if (!validatePat(token)) {
    return {
      ok: false,
      message: "Not a fine-grained PAT (github_pat_…). Classic tokens are refused on purpose.",
    };
  }
  if (isFixture()) return { ok: true };

  const login = await new Promise<KetQua>((resolve) => {
    const p = spawn("gh", ["auth", "login", "--hostname", "github.com", "--with-token"], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    p.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    p.on("error", (e) => resolve({ ok: false, message: `Could not run gh: ${e.message}` }));
    p.on("close", (code) =>
      resolve(code === 0 ? { ok: true } : { ok: false, message: stderr.trim() || `gh exited ${code}` }),
    );
    p.stdin.write(token.trim());
    p.stdin.end();
  });
  if (!login.ok) return login;

  try {
    await run("gh", ["auth", "setup-git", "--hostname", "github.com"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Signed in, but setup-git failed: ${(e as Error).message}` };
  }
}

/**
 * Store the token from `claude setup-token` for the runner. The user runs
 * setup-token on ANY machine with a browser (their laptop is fine), pastes
 * the result here, and session-run.sh exports it as CLAUDE_CODE_OAUTH_TOKEN
 * — no interactive login on the bee machine at all. Owner-read-only, and
 * mode is set on the tmp file BEFORE the rename so the token is never
 * world-readable, not even for a moment.
 */
export async function saveClaudeToken(token: string): Promise<KetQua> {
  const gon = token.trim();
  if (!validateClaudeToken(gon)) {
    return {
      ok: false,
      message:
        "Not a setup-token token (sk-ant-oat01-…). Run `claude setup-token` and paste its output.",
    };
  }
  if (isFixture()) return { ok: true };

  const file = path.join(root(), "claude.env");
  try {
    await fs.mkdir(root(), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, `CLAUDE_CODE_OAUTH_TOKEN=${gon}\n`, { mode: 0o600 });
    await fs.chmod(tmp, 0o600);
    await fs.rename(tmp, file);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not save token: ${(e as Error).message}` };
  }
}

/*
 * Web-driven `claude setup-token`: the web spawns the flow on the machine,
 * hands the user the login URL, and feeds the pasted confirmation code
 * back in. The child runs under a pseudo-TTY via `script` (util-linux),
 * because setup-token's ink UI refuses a plain pipe.
 *
 * One flow at a time (module-level singleton): this is a solo-operator
 * machine, and a second concurrent login would just steal the first one's
 * stdin. A fresh start kills the previous attempt.
 */
interface SetupTokenFlow {
  p: ReturnType<typeof spawn>;
  out: string;
  done: boolean;
  timeout: NodeJS.Timeout;
}
let setupFlow: SetupTokenFlow | null = null;

function killSetupFlow(): void {
  if (setupFlow === null) return;
  clearTimeout(setupFlow.timeout);
  try {
    setupFlow.p.kill("SIGKILL");
  } catch {
    // Already gone.
  }
  setupFlow = null;
}

export type KetQuaLink = { ok: true; url: string } | { ok: false; message: string };

/** Start the login flow and return the URL for the user to open. */
export async function startClaudeSetup(): Promise<KetQuaLink> {
  if (isFixture()) return { ok: true, url: "https://claude.ai/oauth/authorize?demo=1" };

  killSetupFlow();
  const p = spawn("script", ["-qec", "claude setup-token", "/dev/null"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, TERM: "xterm-256color" },
  });
  const flow: SetupTokenFlow = {
    p,
    out: "",
    done: false,
    // An abandoned flow must not hang around holding a half-done login.
    timeout: setTimeout(killSetupFlow, 10 * 60 * 1000),
  };
  setupFlow = flow;
  p.stdout?.on("data", (d: Buffer) => (flow.out += d.toString()));
  p.stderr?.on("data", (d: Buffer) => (flow.out += d.toString()));
  p.on("close", () => (flow.done = true));

  // The URL appears as soon as the ink UI draws — poll for up to 15s.
  for (let i = 0; i < 60; i++) {
    const url = extractOauthUrl(flow.out);
    if (url !== null) return { ok: true, url };
    if (flow.done) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const loi = flow.done ? "The flow exited before printing a URL." : "Timed out waiting for the URL.";
  killSetupFlow();
  return { ok: false, message: `Could not get a login link — ${loi} Is claude installed on the machine?` };
}

/** Feed the pasted confirmation code in; on success the token lands in claude.env. */
export async function submitClaudeCode(code: string): Promise<KetQua> {
  const gon = code.trim();
  if (!validateSetupCode(gon)) return { ok: false, message: "That does not look like a confirmation code." };
  if (isFixture()) return { ok: true };

  const flow = setupFlow;
  if (flow === null || flow.done) {
    killSetupFlow();
    return { ok: false, message: "No login flow is waiting — get a new link first." };
  }

  flow.p.stdin?.write(`${gon}\n`);
  // setup-token verifies the code and prints the token — give it up to 30s.
  for (let i = 0; i < 120; i++) {
    const token = extractSetupToken(flow.out);
    if (token !== null) {
      killSetupFlow();
      return saveClaudeToken(token);
    }
    if (flow.done) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const daXong = flow.done;
  killSetupFlow();
  return {
    ok: false,
    message: daXong
      ? "The code was rejected — get a new link and try again."
      : "Timed out waiting for the token — get a new link and try again.",
  };
}

export type KetQuaDangKy = { ok: true; slug: string } | { ok: false; message: string };

/**
 * Register a repo: write repos.d/<slug>.env (tmp + rename), slug derived
 * from the repo name. Same file the runner and doctor read — one source.
 */
export async function registerRepo(repo: string): Promise<KetQuaDangKy> {
  const gon = repo.trim();
  if (!REPO_RE.test(gon)) {
    return { ok: false, message: "Repository must be owner/name (letters, digits, ., _, -)." };
  }
  const name = gon.split("/")[1]!;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!SLUG_RE.test(slug)) return { ok: false, message: "Could not derive a slug from that name." };

  if (isFixture()) return { ok: true, slug };

  const dir = path.join(root(), "repos.d");
  const file = path.join(dir, `${slug}.env`);
  try {
    await fs.mkdir(dir, { recursive: true });
    // A different repo already claiming this slug is a real conflict —
    // overwriting it would silently repoint every future session.
    try {
      const cu = await fs.readFile(file, "utf8");
      const repoCu = /^REPO=(.+)$/m.exec(cu)?.[1]?.trim();
      if (repoCu !== undefined && repoCu !== gon) {
        return { ok: false, message: `Slug "${slug}" is already used by ${repoCu}.` };
      }
    } catch {
      // No existing file — free to create.
    }
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, `REPO=${gon}\n`);
    await fs.rename(tmp, file);
    return { ok: true, slug };
  } catch (e) {
    return { ok: false, message: `Could not register: ${(e as Error).message}` };
  }
}

export async function unregisterRepo(slug: string): Promise<KetQua> {
  if (!SLUG_RE.test(slug)) return { ok: false, message: "Invalid slug." };
  if (isFixture()) return { ok: true };
  try {
    await fs.rm(path.join(root(), "repos.d", `${slug}.env`), { force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not unregister: ${(e as Error).message}` };
  }
}

/**
 * Harvest Claude usage from what the sessions ALREADY wrote to disk —
 * there is no `claude usage` CLI command, but every session's run.jsonl
 * carries rate_limit_event lines and its trap saves the final result as
 * usage.json. "Refresh" regenerates state/claude-rate-limit.json and
 * state/recent.jsonl from those, in the exact shapes the old parsers
 * (and thus the Overview panel) already accept.
 */
export async function harvestClaudeUsage(): Promise<KetQua> {
  if (isFixture()) return { ok: true };

  const sessionsDir = path.join(root(), "sessions");
  let ids: string[] = [];
  try {
    ids = (await fs.readdir(sessionsDir)).filter((d) => /^[a-f0-9-]{36}$/.test(d));
  } catch {
    ids = [];
  }

  interface RateEvent { info: Record<string, unknown>; mtimeMs: number }
  let latest: RateEvent | null = null;
  const rows: string[] = [];

  for (const id of ids) {
    const sdir = path.join(sessionsDir, id);

    // Last rate_limit_event of the most recently active session wins.
    try {
      const st = await fs.stat(path.join(sdir, "run.jsonl"));
      const text = await fs.readFile(path.join(sdir, "run.jsonl"), "utf8");
      for (const line of text.split("\n")) {
        if (!line.includes('"rate_limit_event"')) continue;
        try {
          const d = JSON.parse(line) as Record<string, unknown>;
          const info = d.rate_limit_info;
          if (typeof info === "object" && info !== null) {
            if (latest === null || st.mtimeMs >= latest.mtimeMs) {
              latest = { info: info as Record<string, unknown>, mtimeMs: st.mtimeMs };
            }
          }
        } catch {
          // Half-written line mid-stream — skip.
        }
      }
    } catch {
      // No run.jsonl — nothing to harvest here.
    }

    // usage.json (the session's final result line) → one recent.jsonl row.
    try {
      const usage = JSON.parse(await fs.readFile(path.join(sdir, "usage.json"), "utf8")) as Record<string, unknown>;
      const meta = JSON.parse(await fs.readFile(path.join(sdir, "meta.json"), "utf8")) as Record<string, unknown>;
      const sess = JSON.parse(await fs.readFile(path.join(sdir, "session.json"), "utf8")) as Record<string, unknown>;

      let tin = 0, tout = 0, tcr = 0, tcw = 0, cost = 0;
      const mu = usage.modelUsage;
      if (typeof mu === "object" && mu !== null) {
        for (const m of Object.values(mu as Record<string, unknown>)) {
          if (typeof m !== "object" || m === null) continue;
          const u = m as Record<string, unknown>;
          tin += typeof u.inputTokens === "number" ? u.inputTokens : 0;
          tout += typeof u.outputTokens === "number" ? u.outputTokens : 0;
          tcr += typeof u.cacheReadInputTokens === "number" ? u.cacheReadInputTokens : 0;
          tcw += typeof u.cacheCreationInputTokens === "number" ? u.cacheCreationInputTokens : 0;
          cost += typeof u.costUSD === "number" ? u.costUSD : 0;
        }
      }
      rows.push(
        JSON.stringify({
          id,
          repo: typeof sess.repo === "string" ? sess.repo : "",
          number: typeof sess.num === "number" ? sess.num : 0,
          rule: "session",
          result: typeof meta.status === "string" ? meta.status : "unknown",
          turns: typeof usage.num_turns === "number" ? usage.num_turns : 0,
          duration_s: typeof usage.duration_ms === "number" ? Math.round(usage.duration_ms / 1000) : 0,
          at: typeof meta.ended_at === "string" ? meta.ended_at : (meta.started_at ?? ""),
          tokens_in: tin,
          tokens_out: tout,
          tokens_cache_read: tcr,
          tokens_cache_write: tcw,
          cost_usd: cost,
          session_id: id,
        }),
      );
    } catch {
      // No usage.json (refused/never-spoke session) — skip the row.
    }
  }

  try {
    const stateDir = path.join(root(), "state");
    await fs.mkdir(stateDir, { recursive: true });
    // recent.jsonl is REGENERATED wholesale — sessions on disk are the one
    // source of truth, so a re-harvest can never double-count.
    const tmp = path.join(stateDir, ".recent.jsonl.tmp");
    await fs.writeFile(tmp, rows.length > 0 ? rows.join("\n") + "\n" : "");
    await fs.rename(tmp, path.join(stateDir, "recent.jsonl"));

    if (latest !== null) {
      const rl = JSON.stringify({ ...latest.info, seen_at: new Date().toISOString() });
      const tmp2 = path.join(stateDir, ".claude-rate-limit.json.tmp");
      await fs.writeFile(tmp2, rl);
      await fs.rename(tmp2, path.join(stateDir, "claude-rate-limit.json"));
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not write usage state: ${(e as Error).message}` };
  }
}

/** PAUSE file toggle — pausing is create, resuming is remove; both idempotent. */
export async function setPaused(paused: boolean): Promise<KetQua> {
  if (isFixture()) return { ok: true };
  const file = path.join(root(), "PAUSE");
  try {
    if (paused) {
      await fs.writeFile(file, "");
    } else {
      await fs.rm(file, { force: true });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not update PAUSE: ${(e as Error).message}` };
  }
}
