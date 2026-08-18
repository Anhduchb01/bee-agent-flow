"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import {
  enableLinger,
  ghAuthLogin,
  registerRepo,
  runDoctor,
  setPaused,
  unregisterRepo,
} from "@/lib/bee/machine-ctl";

export interface KetQua {
  ok: boolean;
  message: string;
}

const KHONG_QUYEN: KetQua = { ok: false, message: "You are not allowed to do this." };

/** Every mutating step ends with a fresh doctor run — the page shows truth, not hope. */
async function refresh(): Promise<void> {
  await runDoctor();
  revalidatePath("/setup");
}

/** Re-run the machine's A+ checklist and refresh the setup page. */
export async function runDoctorAction(): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;

  const ket = await runDoctor();
  revalidatePath("/setup");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

export async function enableLingerAction(): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await enableLinger();
  await refresh();
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

export async function savePatAction(token: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await ghAuthLogin(token);
  await refresh();
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

export async function registerRepoAction(repo: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await registerRepo(repo);
  await refresh();
  // The combobox on /sessions and /canvas reads the same source.
  revalidatePath("/sessions");
  revalidatePath("/canvas");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

export async function unregisterRepoAction(slug: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await unregisterRepo(slug);
  await refresh();
  revalidatePath("/sessions");
  revalidatePath("/canvas");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

export async function setPausedAction(paused: boolean): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await setPaused(paused);
  await refresh();
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}
