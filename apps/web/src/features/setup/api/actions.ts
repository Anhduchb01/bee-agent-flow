"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";
import {
  startAddSlot,
  unpinToken,
  installSlayer,
  captureSlot,
  switchSlot,
  pullGrantedAccounts,
  finishAddSlot,
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

export interface Result {
  ok: boolean;
  message: string;
}

const KHONG_QUYEN: Result = { ok: false, message: "You are not allowed to do this." };

/** Every mutating step ends with a fresh doctor run — the page shows truth, not hope. */
async function refresh(): Promise<void> {
  await runDoctor();
  revalidatePath("/setup");
}

/** Re-run the machine's A+ checklist and refresh the setup page. */
export async function runDoctorAction(): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;

  const outcome = await runDoctor();
  revalidatePath("/setup");
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

/** "Dọn ngay" — gc oneshot, xong mới trả về nên UI đọc được kết quả tươi. */
export async function runGcAction(): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await runGc();
  revalidatePath("/setup");
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

export async function enableLingerAction(): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await enableLinger();
  await refresh();
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

export async function savePatAction(token: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await ghAuthLogin(token);
  await refresh();
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

export type LinkResult = { ok: true; url: string } | { ok: false; message: string };

/** Spawn `claude setup-token` on the machine and hand back the login URL. */
export async function startClaudeSetupAction(): Promise<LinkResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: KHONG_QUYEN.message };
  return startClaudeSetup();
}

/** Feed the code the browser showed back into the waiting flow. */
export async function submitClaudeCodeAction(code: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await submitClaudeCode(code);
  await refresh();
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

export async function saveClaudeTokenAction(token: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await saveClaudeToken(token);
  await refresh();
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

/**
 * Returns the derived slug on success: the new-project dialog needs it to
 * offer the env step right away (env.d is keyed by slug, not by repo).
 */
export async function registerRepoAction(repo: string): Promise<Result & { slug?: string }> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await registerRepo(repo);
  await refresh();
  // The combobox on /sessions and /canvas reads the same source.
  revalidatePath("/sessions");
  revalidatePath("/canvas");
  revalidatePath("/projects");
  return outcome.ok ? { ok: true, message: "", slug: outcome.slug } : { ok: false, message: outcome.message };
}

export async function unregisterRepoAction(slug: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await unregisterRepo(slug);
  await refresh();
  revalidatePath("/sessions");
  revalidatePath("/canvas");
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

/** Env files land in env.d/<slug> — session-run overlays them per worktree. */
export async function saveEnvFileAction(
  slug: string,
  path: string,
  content: string,
): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await saveEnvFile(slug, path, content);
  revalidatePath("/setup");
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

export async function deleteEnvFileAction(slug: string, path: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await deleteEnvFile(slug, path);
  revalidatePath("/setup");
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

export async function setPausedAction(paused: boolean): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await setPaused(paused);
  await refresh();
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

/*
 * Nhiều tài khoản Claude (token-slayer). Đổi tài khoản là đổi cho CẢ MÁY,
 * nên `switchSlotAction` đếm phiên đang chạy trước — luật nằm ở lớp dưới, chỗ
 * này chỉ cung cấp con số nó cần.
 */

async function countRunningSessions(): Promise<number> {
  const session = await getBee().listSessions();
  return session.filter((p) => p.status === "running").length;
}

export async function switchSlotAction(target: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await switchSlot(target, await countRunningSessions());
  await refresh();
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

/** Chụp tài khoản `claude` đang đăng nhập thành một slot mới. */
export async function captureSlotAction(name: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await captureSlot(name);
  await refresh();
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

/** Thêm tài khoản KHÁC: mở `tok add <tên> --login`, trả link duyệt. */
export async function startAddSlotAction(name: string): Promise<LinkResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: KHONG_QUYEN.message };
  return startAddSlot(name);
}

export async function finishAddSlotAction(code: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await finishAddSlot(code);
  await refresh();
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

/** Dán token token-slayer → chạy trình cài đặt của họ trên máy. */
export async function installSlayerAction(token: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await installSlayer(token);
  await refresh();
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}

/** `tok setup` — nhận tài khoản admin cấp; trả nguyên lời của nó. */
export async function pullGrantedAccountsAction(): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await pullGrantedAccounts();
  await refresh();
  return outcome.ok ? { ok: true, message: outcome.speak ?? "" } : { ok: false, message: outcome.message };
}

/** Gỡ token ghim trong claude.env để lựa chọn tài khoản có hiệu lực. */
export async function unpinTokenAction(): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const outcome = await unpinToken();
  await refresh();
  return outcome.ok ? { ok: true, message: "" } : { ok: false, message: outcome.message };
}
