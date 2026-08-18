"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import { runDoctor } from "@/lib/bee/machine-ctl";

export interface KetQua {
  ok: boolean;
  message: string;
}

/** Re-run the machine's A+ checklist and refresh the setup page. */
export async function runDoctorAction(): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: "You are not allowed to do this." };

  const ket = await runDoctor();
  revalidatePath("/setup");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}
