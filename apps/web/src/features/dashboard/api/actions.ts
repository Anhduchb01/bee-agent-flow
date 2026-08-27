"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import { fetchClaudeAccountUsage, harvestClaudeUsage, stopPreview } from "@/lib/bee/machine-ctl";

export interface Result {
  ok: boolean;
  message: string;
}

/**
 * Refresh = two sources, one click: the account-wide oauth usage endpoint
 * (real percentages, matches /usage on any machine) plus the local session
 * harvest (tokens/cost of what ran here). A failing endpoint does not
 * block the local half — each reports its own truth.
 */
export async function refreshUsageAction(): Promise<Result> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: "You are not allowed to do this." };

  // A person pressed a button: never hand them a cached answer.
  const [account, local] = await Promise.all([
    fetchClaudeAccountUsage({ force: true }),
    harvestClaudeUsage(),
  ]);
  revalidatePath("/");
  const err = [account, local].filter((k) => !k.ok).map((k) => (k.ok ? "" : k.message));
  return err.length === 0 ? { ok: true, message: "" } : { ok: false, message: err.join(" · ") };
}

/** Stop a live preview (V2.3) — validation lives in stopPreview. */
export async function stopPreviewAction(unit: string, port: number): Promise<Result> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: "You are not allowed to do this." };
  const outcome = await stopPreview(unit, port);
  revalidatePath("/");
  return outcome.ok ? { ok: true, message: "" } : outcome;
}
