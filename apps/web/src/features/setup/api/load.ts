import "server-only";

import { getBee } from "@/lib/bee";
import type { BeeDoctor } from "@/lib/bee/types";

/** Latest machine self-check; `null` = doctor has never run. */
export function loadDoctor(): Promise<BeeDoctor | null> {
  return getBee().readDoctor();
}
