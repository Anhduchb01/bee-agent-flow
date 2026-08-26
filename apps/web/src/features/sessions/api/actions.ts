"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";
import path from "node:path";

import { fetchArtifactDetail, type ArtifactResult } from "@/lib/bee/artifact-detail";
import { expandCommandText } from "@/lib/bee/doctor-fs";
import {
  changeSessionModel,
  changeSessionMode,
  stopSession,
  openSession,
  sendToSession,
  saveUploadToSession,
  continueSession,
  answerPermission,
} from "@/lib/bee/session-ctl";
import type {
  BeeEvidenceFile,
  BeeSession,
  BeeSessionMode,
  BeeSessionModel,
} from "@/lib/bee/types";

export type OpenSessionResult =
  | { ok: true; id: string; session: BeeSession | null }
  | { ok: false; message: string };
export interface Result {
  ok: boolean;
  message: string;
}

const KHONG_QUYEN: Result = { ok: false, message: "You are not allowed to do this." };

/**
 * "New session" — một nút, không form 5 mục. slug suy từ tên repo, num là
 * số phiên tiếp theo của slug đó (chỉ để đặt tên branch bee/<slug>-<n>,
 * không phải khoá — khoá là UUID).
 */
export async function startSessionAction(input: {
  /** Slug của repo ĐÃ ĐĂNG KÝ, hoặc `null` = phiên chat không repo. */
  repoSlug: string | null;
  /** Permission mode (V2.5a) — mặc định "auto"; phiên chat bỏ qua. */
  mode?: BeeSessionMode;
}): Promise<OpenSessionResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: KHONG_QUYEN.message };

  // Chỉ repo đã đăng ký (repos.d) — không có đường gõ tự do. Repo mới thì
  // đăng ký trước (PAT phủ + branch protection, doctor kiểm) rồi mới có phiên.
  let slug = "chat";
  let repo = "";
  const worktree = input.repoSlug !== null;
  if (input.repoSlug !== null) {
    const registered = (await getBee().listRepos()).find((r) => r.slug === input.repoSlug);
    if (!registered) {
      return { ok: false, message: "This repository is not registered. Add it to repos.d first." };
    }
    slug = registered.slug;
    repo = registered.repo;
  }

  const daCo = await getBee().listSessions();
  const num = daCo.filter((p) => p.slug === slug).length + 1;

  const ket = await openSession({
    slug,
    num,
    repo,
    // Untitled on purpose — the first chat message names the session
    // (auto-title in session-ctl), like Claude Code does.
    title: null,
    worktree,
    mode: input.mode,
  });
  if (!ket.ok) return ket;

  revalidatePath("/sessions");
  revalidatePath("/canvas");
  // Trả luôn phiên vừa mở — canvas cần nó để mở panel tại chỗ không round-trip.
  const session = await getBee().readSession(ket.id);
  return { ok: true, id: ket.id, session };
}

export async function sendToSessionAction(id: string, text: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  // "/build args" expands to the command file's body REPL-style; the
  // history still shows what was typed. Plain text passes through as-is.
  const expanded = await expandCommandText(
    path.join(process.env.HOME ?? "", ".claude", "commands"),
    text.trim(),
  );
  const ket = await sendToSession(id, expanded, text);
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/**
 * "+" menu upload: the file lands in the worktree's `.bee/uploads/`; the
 * client appends the returned path to the draft so the agent Reads it.
 * Size cap and name sanitizing live in saveUploadToSession.
 */
export async function uploadFileAction(
  id: string,
  formData: FormData,
): Promise<Result & { relPath?: string }> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "No file in the request." };
  const ket = await saveUploadToSession(id, file.name, new Uint8Array(await file.arrayBuffer()));
  return ket.ok
    ? { ok: true, message: "", relPath: ket.relPath }
    : { ok: false, message: ket.message };
}

export async function stopSessionAction(id: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await stopSession(id);
  revalidatePath("/sessions");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/** Answer a manual-mode approval card (V2.5b) — validation in answerPermission. */
export async function answerPermissionAction(
  id: string,
  requestId: string,
  allow: boolean,
  inputJson: string,
): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await answerPermission(id, requestId, allow, inputJson);
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/** Continue a finished/stopped session (V2.6) — start = resume, idempotent. */
export async function continueAction(id: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await continueSession(id);
  revalidatePath("/sessions");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/**
 * Mode switch mid-session (V2.5a): validation + restart-resume live in
 * changeSessionMode; here only the auth guard and cache revalidation.
 */
export async function changeModeAction(id: string, mode: BeeSessionMode): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await changeSessionMode(id, mode);
  revalidatePath("/sessions");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/**
 * Model switch mid-session (V2.7) — allowlist + restart-resume live in
 * changeSessionModel; here only the auth guard and cache revalidation.
 */
export async function changeModelAction(id: string, model: BeeSessionModel): Promise<Result> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await changeSessionModel(id, model);
  revalidatePath("/sessions");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/**
 * Issue/PR detail for the in-app viewer — read on demand when a panel
 * opens, never polled. Validation and the registered-repo allowlist live
 * in fetchArtifactDetail.
 */
export async function loadArtifactDetailAction(
  repo: string,
  kind: "issue" | "pr",
  number: number,
): Promise<ArtifactResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: KHONG_QUYEN.message };
  return fetchArtifactDetail(repo, kind, number);
}

/** Evidence của phiên đã đẻ ra artifact này (V2.1) — ảnh/video cho màn duyệt. */
export async function loadArtifactEvidenceAction(
  repo: string,
  kind: "issue" | "pr",
  number: number,
): Promise<{ sessionId: string; files: BeeEvidenceFile[] } | null> {
  const actor = await getActor();
  if (!actor) return null;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null;
  if (!Number.isInteger(number) || number <= 0) return null;
  return getBee().findArtifactEvidence(repo, kind, number);
}

