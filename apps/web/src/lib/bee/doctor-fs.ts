import fs from "node:fs/promises";
import path from "node:path";

import type { BeeDoctor, BeeDoctorCheck } from "./types";

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
