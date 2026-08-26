import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { ctl, ctlSpawn } from "./ctl";

/**
 * Machine-level controls for the setup screen. Same discipline as
 * session-ctl: fixed unit/command names only — nothing user-typed ever
 * reaches an argv except through an allowlist regex — and failures come
 * back as data, not exceptions.
 */

export type Result = { ok: true } | { ok: false; message: string };

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SLUG_RE = /^[a-z0-9-]+$/;

function isFixture(): boolean {
  return process.env.BEE_SOURCE !== "disk";
}

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

/**
 * Chạy gc theo yêu cầu (nút "Dọn ngay"). Cùng khuôn với runDoctor: unit là
 * oneshot nên `start` chờ chạy xong, và web đọc được gc.json tươi ngay sau đó.
 */
export async function runGc(): Promise<Result> {
  if (isFixture()) return { ok: true };
  try {
    await ctl("systemctl", ["--user", "start", "bee-gc.service"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not run gc: ${(e as Error).message}` };
  }
}

/**
 * Re-run the A+ hygiene checklist. The unit is oneshot, so `systemctl start`
 * blocks until doctor.sh finished writing doctor.json — the page can reload
 * fresh results immediately.
 *
 * The unit runs `doctor.sh --exit-zero`, so a red checklist is no longer a
 * unit failure at all (V3.T19). The tolerance below stays as a belt: an
 * OLDER unit file still on disk — the exact state of a machine between a
 * code update and its next install.sh — would otherwise turn a perfectly
 * good checklist run into a red banner on /setup.
 */
export async function runDoctor(): Promise<Result> {
  if (isFixture()) return { ok: true };
  try {
    await ctl("systemctl", ["--user", "start", "bee-doctor.service"]);
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    // Old unit file (pre --exit-zero): exit 1 means checks failed, and
    // doctor.json was written all the same. Not a failure to report.
    if (/control process exited|code=exited|exit code 1/i.test(msg)) return { ok: true };
    return { ok: false, message: `Could not run doctor: ${msg}` };
  }
}

/** Sessions must survive logout — `loginctl enable-linger` for our own user. */
export async function enableLinger(): Promise<Result> {
  if (isFixture()) return { ok: true };
  try {
    await ctl("loginctl", ["enable-linger"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not enable linger: ${(e as Error).message}` };
  }
}

export { validatePat } from "./pat";
import {
  waitFor,
  closeFlow,
  sendCode,
  oauthError,
  lastScreen,
  openFlow,
  nudgeEnter,
  type PtyFlow,
} from "./pty-flow";
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
export async function ghAuthLogin(token: string): Promise<Result> {
  if (!validatePat(token)) {
    return {
      ok: false,
      message: "Not a fine-grained PAT (github_pat_…). Classic tokens are refused on purpose.",
    };
  }
  if (isFixture()) return { ok: true };

  const login = await new Promise<Result>((resolve) => {
    let p;
    try {
      p = ctlSpawn("gh", ["auth", "login", "--hostname", "github.com", "--with-token"], {
        stdio: ["pipe", "ignore", "pipe"],
      });
    } catch (e) {
      resolve({ ok: false, message: `Could not run gh: ${(e as Error).message}` });
      return;
    }
    if (p.stdin === null) {
      resolve({ ok: false, message: "Could not run gh: no stdin to hand the token to." });
      return;
    }
    let stderr = "";
    p.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    p.on("error", (e) => resolve({ ok: false, message: `Could not run gh: ${e.message}` }));
    p.on("close", (code) =>
      resolve(code === 0 ? { ok: true } : { ok: false, message: stderr.trim() || `gh exited ${code}` }),
    );
    // STDIN, không phải argv: token trong argv là token lộ cho mọi `ps`.
    p.stdin.write(token.trim());
    p.stdin.end();
  });
  if (!login.ok) return login;

  try {
    await ctl("gh", ["auth", "setup-git", "--hostname", "github.com"]);
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
export async function saveClaudeToken(token: string): Promise<Result> {
  const trimmed = token.trim();
  if (!validateClaudeToken(trimmed)) {
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
    await fs.writeFile(tmp, `CLAUDE_CODE_OAUTH_TOKEN=${trimmed}\n`, { mode: 0o600 });
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
let setupFlow: PtyFlow | null = null;

function killSetupFlow(): void {
  closeFlow(setupFlow);
  setupFlow = null;
}

export type LinkResult = { ok: true; url: string } | { ok: false; message: string };

/** Start the login flow and return the URL for the user to open. */
export async function startClaudeSetup(): Promise<LinkResult> {
  if (isFixture()) return { ok: true, url: "https://claude.ai/oauth/authorize?demo=1" };

  killSetupFlow();
  const flow = openFlow("claude setup-token");
  setupFlow = flow;

  const url = await waitFor(flow, extractOauthUrl);
  if (url !== null) return { ok: true, url };
  const err = flow.done ? "The flow exited before printing a URL." : "Timed out waiting for the URL.";
  const swapWith = lastScreen(flow.out);
  killSetupFlow();
  // "Is claude installed?" sent us hunting for a missing binary on 25/08
  // when claude was installed twice and the unit's PATH picked the stale
  // copy, which sat on its splash screen. Show what the screen actually
  // said — that names the real fault in one glance.
  return {
    ok: false,
    message: `Could not get a login link — ${err}${swapWith === null ? "" : ` Last thing the flow printed: “${swapWith}”`}`,
  };
}

/** Feed the pasted confirmation code in; on success the token lands in claude.env. */
export async function submitClaudeCode(code: string): Promise<Result> {
  const trimmed = code.trim();
  if (!validateSetupCode(trimmed)) return { ok: false, message: "That does not look like a confirmation code." };
  if (isFixture()) return { ok: true };

  const flow = setupFlow;
  if (flow === null || flow.done) {
    killSetupFlow();
    return { ok: false, message: "No login flow is waiting — get a new link first." };
  }

  await sendCode(flow, trimmed);
  // setup-token verifies the code and prints the token — give it up to 30s.
  for (let i = 0; i < 120; i++) {
    if (i === 20) nudgeEnter(flow);
    const token = extractSetupToken(flow.out);
    if (token !== null) {
      killSetupFlow();
      return saveClaudeToken(token);
    }
    // A rejected code says so on screen and offers a retry — that is an
    // answer, not something to keep waiting for.
    const refused = oauthError(flow.out);
    if (refused !== null) {
      killSetupFlow();
      return { ok: false, message: `${refused} — get a new link and try again.` };
    }
    if (flow.done) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const daXong = flow.done;
  const swapWith = lastScreen(flow.out);
  killSetupFlow();
  return {
    ok: false,
    message:
      (daXong
        ? "The code was rejected — get a new link and try again."
        : "Timed out waiting for the token — get a new link and try again.") +
      (swapWith === null ? "" : ` Last thing the flow printed: “${swapWith}”`),
  };
}

export type RegisterResult = { ok: true; slug: string } | { ok: false; message: string };

/**
 * Register a repo: write repos.d/<slug>.env (tmp + rename), slug derived
 * from the repo name. Same file the runner and doctor read — one source.
 */
export async function registerRepo(repo: string): Promise<RegisterResult> {
  const trimmed = repo.trim();
  if (!REPO_RE.test(trimmed)) {
    return { ok: false, message: "Repository must be owner/name (letters, digits, ., _, -)." };
  }
  const name = trimmed.split("/")[1]!;
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
      if (repoCu !== undefined && repoCu !== trimmed) {
        return { ok: false, message: `Slug "${slug}" is already used by ${repoCu}.` };
      }
    } catch {
      // No existing file — free to create.
    }
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, `REPO=${trimmed}\n`);
    await fs.rename(tmp, file);
    return { ok: true, slug };
  } catch (e) {
    return { ok: false, message: `Could not register: ${(e as Error).message}` };
  }
}

export async function unregisterRepo(slug: string): Promise<Result> {
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
 * Account-wide usage from api.anthropic.com/api/oauth/usage — the same
 * endpoint behind Claude Code's /usage screen, so the numbers match what
 * the user sees there, including work done on OTHER machines. Called only
 * from the refresh button: the endpoint 429s under frequent polling.
 * Token: the pasted setup-token first, else the machine's interactive
 * credentials. A failed fetch leaves the previous snapshot untouched.
 */
export async function fetchClaudeAccountUsage(opts?: {
  credentialsFile?: string;
}): Promise<Result> {
  if (isFixture()) return { ok: true };

  let token = "";
  try {
    const env = await fs.readFile(path.join(root(), "claude.env"), "utf8");
    token = /^CLAUDE_CODE_OAUTH_TOKEN=(sk-ant-oat01-\S+)$/m.exec(env)?.[1] ?? "";
  } catch {
    // No claude.env — try the interactive login below.
  }
  if (token === "") {
    try {
      // HOME phải có THẬT. `path.join("", ".claude", …)` ra một đường dẫn
      // TƯƠNG ĐỐI, nên thiếu HOME thì chỗ này lặng lẽ đọc `.claude/…` trong
      // thư mục làm việc của tiến trình — không phải của người dùng. Đó cũng
      // là lý do Turbopack cảnh báo và kéo cả project vào bản standalone:
      // nó thấy một đường dẫn có thể là project-relative.
      const home = process.env.HOME ?? "";
      const credFile = opts?.credentialsFile ?? (home === "" ? "" : path.join(home, ".claude", ".credentials.json"));
      if (credFile === "") throw new Error("no HOME");
      // turbopackIgnore: đây là file runtime của MÁY, không bao giờ là
      // nguồn của app — không có gì để trace vào bundle.
      const cred = JSON.parse(await fs.readFile(/* turbopackIgnore: true */ credFile, "utf8")) as Record<string, unknown>;
      const oauth = cred.claudeAiOauth;
      if (typeof oauth === "object" && oauth !== null) {
        const at = (oauth as Record<string, unknown>).accessToken;
        if (typeof at === "string") token = at;
      }
    } catch {
      // No credentials either.
    }
  }
  if (token === "") {
    return { ok: false, message: "No Claude token on this machine — sign in on /setup first." };
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { ok: false, message: `Could not reach the usage endpoint: ${(e as Error).message}` };
  }
  if (!res.ok) {
    return { ok: false, message: `Usage endpoint answered ${res.status} — try again in a minute.` };
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return { ok: false, message: "Usage endpoint returned something that is not JSON." };
  }
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const usageWindow = (v: unknown) => {
    if (typeof v !== "object" || v === null) return null;
    const w = v as Record<string, unknown>;
    if (typeof w.utilization !== "number") return null;
    return {
      percent: w.utilization,
      resets_at: typeof w.resets_at === "string" ? w.resets_at : null,
    };
  };
  const usage = {
    five_hour: usageWindow(o.five_hour),
    seven_day: usageWindow(o.seven_day),
    fetched_at: new Date().toISOString(),
  };
  if (usage.five_hour === null && usage.seven_day === null) {
    return { ok: false, message: "Usage endpoint answered without any window data." };
  }

  try {
    const stateDir = path.join(root(), "state");
    await fs.mkdir(stateDir, { recursive: true });
    const tmp = path.join(stateDir, ".claude-usage.json.tmp");
    await fs.writeFile(tmp, JSON.stringify(usage));
    await fs.rename(tmp, path.join(stateDir, "claude-usage.json"));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not write usage state: ${(e as Error).message}` };
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
export async function harvestClaudeUsage(): Promise<Result> {
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

/*
 * Per-repo env store (env.d/<slug>/…), managed from /setup: the files
 * session-run overlays onto every worktree. Same discipline as the rest
 * of this file — slug and relative path go through allowlists BEFORE any
 * filesystem call, and a resolved-path check backstops the regex.
 */
const ENV_PATH_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const ENV_MAX_BYTES = 64 * 1024;

export interface BeeEnvFile {
  path: string;
  content: string;
}

function envDirOf(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return null;
  return path.join(root(), "env.d", slug);
}

function envFileOf(slug: string, relPath: string): string | null {
  const dir = envDirOf(slug);
  if (dir === null) return null;
  if (!ENV_PATH_RE.test(relPath) || relPath.split("/").includes("..")) return null;
  const file = path.resolve(dir, relPath);
  // Belt over the regex braces: the resolved path must stay inside env.d.
  if (!file.startsWith(path.resolve(dir) + path.sep) && file !== path.resolve(dir)) return null;
  return file;
}

export async function listEnvFiles(slug: string): Promise<BeeEnvFile[]> {
  const dir = envDirOf(slug);
  if (dir === null || isFixture()) return [];
  const ra: BeeEnvFile[] = [];
  async function quet(dir: string, baseDir: string): Promise<void> {
    let row: string[] = [];
    try {
      row = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const m of row) {
      const full = path.join(dir, m);
      const st = await fs.stat(full).catch(() => null);
      if (st === null) continue;
      if (st.isDirectory()) await quet(full, baseDir);
      else ra.push({ path: path.relative(baseDir, full), content: await fs.readFile(full, "utf8") });
    }
  }
  await quet(dir, dir);
  return ra.sort((a, b) => a.path.localeCompare(b.path));
}

export async function saveEnvFile(slug: string, relPath: string, content: string): Promise<Result> {
  const file = envFileOf(slug, relPath);
  if (file === null) return { ok: false, message: "Invalid path — relative, no '..', no leading slash." };
  if (Buffer.byteLength(content) > ENV_MAX_BYTES) {
    return { ok: false, message: "Too large — env files carry keys, not data (max 64KB)." };
  }
  if (isFixture()) return { ok: true };
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, content, { mode: 0o600 });
    await fs.chmod(tmp, 0o600);
    await fs.rename(tmp, file);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not save: ${(e as Error).message}` };
  }
}

export async function deleteEnvFile(slug: string, relPath: string): Promise<Result> {
  const file = envFileOf(slug, relPath);
  if (file === null) return { ok: false, message: "Invalid path." };
  if (isFixture()) return { ok: true };
  try {
    await fs.rm(file, { force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Could not delete: ${(e as Error).message}` };
  }
}

/** PAUSE file toggle — pausing is create, resuming is remove; both idempotent. */
export async function setPaused(paused: boolean): Promise<Result> {
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

/* ── V2.3 · Live previews — list what bee-preview started, stop it ──────── */

import { readPreviewIn } from "./sessions-fs";
import { isSessionId } from "./session-id";
import type { BeePreviewRecord } from "./sessions-fs";

const PREVIEW_UNIT_RE = /^bee-preview-[a-z0-9][a-z0-9-]*$/;

export interface BeePreviewLive extends BeePreviewRecord {
  slug: string;
}

type RunCtl = (cmd: string, args: string[]) => Promise<{ stdout: string }>;

/**
 * Previews the bee-preview skill started: read every session's last
 * bee_preview line, keep the ones whose transient unit is STILL active.
 * The unit name from run.jsonl passes the allowlist regex before it ever
 * reaches systemctl's argv — run.jsonl content is agent-written.
 */
export async function listPreviews(opts?: { runCtl?: RunCtl }): Promise<BeePreviewLive[]> {
  if (isFixture()) {
    return [
      {
        sessionId: "de300000-0000-4000-8000-000000000001",
        slug: "myapp",
        unit: "bee-preview-myapp-41",
        url: "https://demo.tailnet.example:3441",
        port: 3441,
        ts: "2026-08-20T10:00:00Z",
      },
    ];
  }
  const runCtl = opts?.runCtl ?? ((cmd: string, args: string[]) => ctl(cmd, args));
  let ids: string[];
  try {
    ids = await fs.readdir(path.join(root(), "sessions"));
  } catch {
    return [];
  }
  const ra: BeePreviewLive[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!isSessionId(id)) continue;
    const p = await readPreviewIn(root(), id);
    if (p === null || seen.has(p.unit)) continue;
    if (!PREVIEW_UNIT_RE.test(p.unit)) continue;
    seen.add(p.unit);
    try {
      await runCtl("systemctl", ["--user", "is-active", `${p.unit}.service`]);
    } catch {
      continue; // unit gone or inactive — preview is not live
    }
    // slug from the unit name: bee-preview-<slug>-<num>
    const slug = p.unit.replace(/^bee-preview-/, "").replace(/-\d+$/, "");
    ra.push({ ...p, slug });
  }
  return ra.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Stop a preview: unit down + the tailscale serve mapping released. */
export async function stopPreview(
  unit: string,
  port: number,
  opts?: { runCtl?: RunCtl },
): Promise<Result> {
  if (!PREVIEW_UNIT_RE.test(unit)) return { ok: false, message: "Invalid preview unit." };
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return { ok: false, message: "Invalid port." };
  }
  if (isFixture()) return { ok: true };
  const runCtl = opts?.runCtl ?? ((cmd: string, args: string[]) => ctl(cmd, args));
  try {
    await runCtl("systemctl", ["--user", "stop", `${unit}.service`]);
  } catch (e) {
    return { ok: false, message: `Could not stop ${unit}: ${(e as Error).message}` };
  }
  try {
    await runCtl("tailscale", ["serve", `--https=${port}`, "off"]);
  } catch {
    // Best-effort: the app is down either way; a stale serve mapping just 502s.
  }
  return { ok: true };
}
