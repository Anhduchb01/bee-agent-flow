"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";
import {
  batDauThemSlot,
  boTokenGhim,
  caiSlayer,
  chupSlot,
  doiSlot,
  nhanTaiKhoanCap,
  xongThemSlot,
} from "@/lib/bee/slayer-ctl";
import {
  deleteEnvFile,
  enableLinger,
  ghAuthLogin,
  registerRepo,
  runDoctor,
  saveClaudeToken,
  saveEnvFile,
  setPaused,
  startClaudeSetup,
  submitClaudeCode,
  unregisterRepo,
  runGc,
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

/** "Dọn ngay" — gc oneshot, xong mới trả về nên UI đọc được kết quả tươi. */
export async function runGcAction(): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await runGc();
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

export type KetQuaLink = { ok: true; url: string } | { ok: false; message: string };

/** Spawn `claude setup-token` on the machine and hand back the login URL. */
export async function startClaudeSetupAction(): Promise<KetQuaLink> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: KHONG_QUYEN.message };
  return startClaudeSetup();
}

/** Feed the code the browser showed back into the waiting flow. */
export async function submitClaudeCodeAction(code: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await submitClaudeCode(code);
  await refresh();
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

export async function saveClaudeTokenAction(token: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await saveClaudeToken(token);
  await refresh();
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/**
 * Returns the derived slug on success: the new-project dialog needs it to
 * offer the env step right away (env.d is keyed by slug, not by repo).
 */
export async function registerRepoAction(repo: string): Promise<KetQua & { slug?: string }> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await registerRepo(repo);
  await refresh();
  // The combobox on /sessions and /canvas reads the same source.
  revalidatePath("/sessions");
  revalidatePath("/canvas");
  revalidatePath("/projects");
  return ket.ok ? { ok: true, message: "", slug: ket.slug } : { ok: false, message: ket.message };
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

/** Env files land in env.d/<slug> — session-run overlays them per worktree. */
export async function saveEnvFileAction(
  slug: string,
  duongDan: string,
  noiDung: string,
): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await saveEnvFile(slug, duongDan, noiDung);
  revalidatePath("/setup");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

export async function deleteEnvFileAction(slug: string, duongDan: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await deleteEnvFile(slug, duongDan);
  revalidatePath("/setup");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

export async function setPausedAction(paused: boolean): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await setPaused(paused);
  await refresh();
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/*
 * Nhiều tài khoản Claude (token-slayer). Đổi tài khoản là đổi cho CẢ MÁY,
 * nên `doiSlotAction` đếm phiên đang chạy trước — luật nằm ở lớp dưới, chỗ
 * này chỉ cung cấp con số nó cần.
 */

async function demPhienDangChay(): Promise<number> {
  const phien = await getBee().listSessions();
  return phien.filter((p) => p.status === "running").length;
}

export async function doiSlotAction(target: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await doiSlot(target, await demPhienDangChay());
  await refresh();
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/** Chụp tài khoản `claude` đang đăng nhập thành một slot mới. */
export async function chupSlotAction(name: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await chupSlot(name);
  await refresh();
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/** Thêm tài khoản KHÁC: mở `tok add <tên> --login`, trả link duyệt. */
export async function batDauThemSlotAction(name: string): Promise<KetQuaLink> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: KHONG_QUYEN.message };
  return batDauThemSlot(name);
}

export async function xongThemSlotAction(code: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await xongThemSlot(code);
  await refresh();
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/** Dán token token-slayer → chạy trình cài đặt của họ trên máy. */
export async function caiSlayerAction(token: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await caiSlayer(token);
  await refresh();
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/** `tok setup` — nhận tài khoản admin cấp; trả nguyên lời của nó. */
export async function nhanTaiKhoanCapAction(): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await nhanTaiKhoanCap();
  await refresh();
  return ket.ok ? { ok: true, message: ket.noi ?? "" } : { ok: false, message: ket.message };
}

/** Gỡ token ghim trong claude.env để lựa chọn tài khoản có hiệu lực. */
export async function boTokenGhimAction(): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await boTokenGhim();
  await refresh();
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}
