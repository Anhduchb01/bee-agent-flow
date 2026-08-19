"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import { harvestClaudeUsage } from "@/lib/bee/machine-ctl";

export interface KetQua {
  ok: boolean;
  message: string;
}

/** Re-harvest usage + rate-limit from session files and refresh Overview. */
export async function refreshUsageAction(): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: "You are not allowed to do this." };

  const ket = await harvestClaudeUsage();
  revalidatePath("/");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}
