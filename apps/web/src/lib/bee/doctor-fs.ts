import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { BeeClaudeAccountUsage, BeeClaudeAuth, BeeClaudeWindow, BeeDoctor, BeeDoctorCheck } from "./types";

/**
 * Read the doctor.json that apps/runner/bin/doctor.sh writes. `null` means
 * doctor has never run (fresh machine) or the file is unreadable — both are
 * "show the install steps", never an exception thrown at the UI.
 */
export async function readDoctorFrom(root: string): Promise<BeeDoctor | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(root, "doctor.json"), "utf8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.checked_at !== "string" || typeof o.ok !== "boolean") return null;

  const checks: BeeDoctorCheck[] = [];
  if (Array.isArray(o.checks)) {
    for (const c of o.checks) {
      if (typeof c !== "object" || c === null) continue;
      const k = c as Record<string, unknown>;
      if (typeof k.id !== "string" || typeof k.ok !== "boolean" || typeof k.detail !== "string") {
        continue;
      }
      checks.push({ id: k.id, ok: k.ok, detail: k.detail });
    }
  }
  return { checked_at: o.checked_at, ok: o.ok, paused: o.paused === true, checks };
}

/**
 * Live Claude auth status — read directly, not through doctor.json, so the
 * setup UI shows the truth even before doctor has ever run. Two accepted
 * paths, checked in the order the runner uses them: the pasted setup-token
 * token (claude.env), then an interactive login on the machine.
 */
export async function readClaudeAuthFrom(
  root: string,
  home: string = os.homedir(),
): Promise<BeeClaudeAuth> {
  try {
    const env = await fs.readFile(path.join(root, "claude.env"), "utf8");
    if (/^CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-/m.test(env)) return "token";
  } catch {
    // No claude.env — fall through.
  }
  try {
    await fs.access(path.join(home, ".claude", ".credentials.json"));
    return "interactive";
  } catch {
    return "none";
  }
}

/** Narrowed read of state/claude-usage.json; missing or corrupt → null. */
export async function readClaudeUsageFrom(root: string): Promise<BeeClaudeAccountUsage | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(root, "state", "claude-usage.json"), "utf8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.fetched_at !== "string") return null;

  const cuaSo = (v: unknown): BeeClaudeWindow | null => {
    if (typeof v !== "object" || v === null) return null;
    const w = v as Record<string, unknown>;
    if (typeof w.percent !== "number") return null;
    return { percent: w.percent, resets_at: typeof w.resets_at === "string" ? w.resets_at : null };
  };
  return { five_hour: cuaSo(o.five_hour), seven_day: cuaSo(o.seven_day), fetched_at: o.fetched_at };
}

/** One slash command (…/.claude/commands/<name>.md) — feeds the "/" palette. */
export interface BeeCommand {
  name: string;
  moTa: string;
}

/**
 * List the machine's global slash commands: every *.md in the commands
 * dir, description from its frontmatter (falls back to the first body
 * line), cut to one palette-sized line.
 */
export async function readCommandsFrom(dir: string): Promise<BeeCommand[]> {
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const ra: BeeCommand[] = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    try {
      const dau = (await fs.readFile(path.join(dir, f), "utf8")).slice(0, 2000);
      const moTa =
        /^description:\s*"?(.+?)"?\s*$/m.exec(dau)?.[1] ??
        dau.replace(/^---[\s\S]*?---/, "").trim().split("\n")[0] ??
        "";
      if (moTa === "") continue;
      ra.push({
        name: f.slice(0, -3),
        moTa: moTa.length > 120 ? `${moTa.slice(0, 120)}…` : moTa,
      });
    } catch {
      // Unreadable file — skip.
    }
  }
  return ra.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Expand "/name args" the way the Claude Code REPL would: body of the
 * command file with $ARGUMENTS substituted. Unknown command or plain text
 * → returned unchanged (the model just sees what was typed). The name is
 * allowlisted before touching the filesystem.
 */
export async function expandCommandText(dir: string, text: string): Promise<string> {
  if (!text.startsWith("/")) return text;
  const [dau = "", ...conLai] = text.split(" ");
  const name = dau.slice(1);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return text;
  let body: string;
  try {
    body = await fs.readFile(path.join(dir, `${name}.md`), "utf8");
  } catch {
    return text;
  }
  body = body.replace(/^---[\s\S]*?---\s*/, "").trim();
  const args = conLai.join(" ").trim();
  if (body.includes("$ARGUMENTS")) return body.replaceAll("$ARGUMENTS", args);
  return args === "" ? body : `${body}\n\nARGUMENTS: ${args}`;
}
