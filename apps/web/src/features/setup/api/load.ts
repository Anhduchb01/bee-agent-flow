import "server-only";

import { getBee } from "@/lib/bee";
import { listEnvFiles, type BeeEnvFile } from "@/lib/bee/machine-ctl";
import type { BeeClaudeAuth, BeeDoctor } from "@/lib/bee/types";

/** Latest machine self-check; `null` = doctor has never run. */
export function loadDoctor(): Promise<BeeDoctor | null> {
  return getBee().readDoctor();
}

/** Kết quả lần gc gần nhất — dòng dung lượng + lý do giữ trên /setup. */
export function loadGc() {
  return getBee().readGc();
}

/** Live Claude sign-in status — direct read, no doctor run needed. */
export function loadClaudeAuth(): Promise<BeeClaudeAuth> {
  return getBee().readClaudeAuth();
}

/** Env store per registered repo — what session-run overlays onto worktrees. */
export async function loadEnvFiles(
  slugs: string[],
): Promise<Record<string, BeeEnvFile[]>> {
  const ra: Record<string, BeeEnvFile[]> = {};
  for (const slug of slugs) ra[slug] = await listEnvFiles(slug);
  return ra;
}
