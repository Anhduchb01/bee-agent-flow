import "server-only";

import { getBee } from "@/lib/bee";
import { readFlow } from "@/lib/bee/flow-fs";
import { listEnvFiles, type BeeEnvFile } from "@/lib/bee/machine-ctl";
import { readSlayerStatus, type SlayerStatus } from "@/lib/bee/slayer-ctl";
import type { AutopilotFlow, BeeClaudeAuth, BeeDoctor } from "@/lib/bee/types";

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

/** Which /commands Autopilot walks through on its own after opening a session. */
export function loadFlow(): Promise<AutopilotFlow> {
  return readFlow(root());
}

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

/** Bảng tài khoản Claude của token-slayer — pool, slot đang bật, token ghim. */
export function loadSlayer(): Promise<SlayerStatus> {
  return readSlayerStatus();
}

/** Env store per registered repo — what session-run overlays onto worktrees. */
export async function loadEnvFiles(
  slugs: string[],
): Promise<Record<string, BeeEnvFile[]>> {
  const ra: Record<string, BeeEnvFile[]> = {};
  for (const slug of slugs) ra[slug] = await listEnvFiles(slug);
  return ra;
}
