import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { BeeClaudeAuth, BeeDoctor, BeeDoctorCheck } from "./types";

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
