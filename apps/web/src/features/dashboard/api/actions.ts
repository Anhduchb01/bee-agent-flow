"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import { fetchClaudeAccountUsage, harvestClaudeUsage } from "@/lib/bee/machine-ctl";

export interface KetQua {
  ok: boolean;
  message: string;
}

/**
 * Refresh = two sources, one click: the account-wide oauth usage endpoint
 * (real percentages, matches /usage on any machine) plus the local session
 * harvest (tokens/cost of what ran here). A failing endpoint does not
 * block the local half — each reports its own truth.
 */
export async function refreshUsageAction(): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: "You are not allowed to do this." };

  const [taiKhoan, local] = await Promise.all([fetchClaudeAccountUsage(), harvestClaudeUsage()]);
  revalidatePath("/");
  const loi = [taiKhoan, local].filter((k) => !k.ok).map((k) => (k.ok ? "" : k.message));
  return loi.length === 0 ? { ok: true, message: "" } : { ok: false, message: loi.join(" · ") };
}
