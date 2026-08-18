import "server-only";

import { getBee } from "@/lib/bee";
import type { BeeClaudeAuth, BeeDoctor } from "@/lib/bee/types";

/** Latest machine self-check; `null` = doctor has never run. */
export function loadDoctor(): Promise<BeeDoctor | null> {
  return getBee().readDoctor();
}

/** Live Claude sign-in status — direct read, no doctor run needed. */
export function loadClaudeAuth(): Promise<BeeClaudeAuth> {
  return getBee().readClaudeAuth();
}
