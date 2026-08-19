"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";
import path from "node:path";

import { expandCommandText } from "@/lib/bee/doctor-fs";
import { dungPhien, moPhien, noiVaoPhien } from "@/lib/bee/session-ctl";
import type { BeeSession } from "@/lib/bee/types";

export type KetQuaMoPhien =
  | { ok: true; id: string; phien: BeeSession | null }
  | { ok: false; message: string };
export interface KetQua {
  ok: boolean;
  message: string;
}

const KHONG_QUYEN: KetQua = { ok: false, message: "You are not allowed to do this." };

/**
 * "New session" — một nút, không form 5 mục. slug suy từ tên repo, num là
 * số phiên tiếp theo của slug đó (chỉ để đặt tên branch bee/<slug>-<n>,
 * không phải khoá — khoá là UUID).
 */
export async function batDauPhien(input: {
  /** Slug của repo ĐÃ ĐĂNG KÝ, hoặc `null` = phiên chat không repo. */
  repoSlug: string | null;
}): Promise<KetQuaMoPhien> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: KHONG_QUYEN.message };

  // Chỉ repo đã đăng ký (repos.d) — không có đường gõ tự do. Repo mới thì
  // đăng ký trước (PAT phủ + branch protection, doctor kiểm) rồi mới có phiên.
  let slug = "chat";
  let repo = "";
  const worktree = input.repoSlug !== null;
  if (input.repoSlug !== null) {
    const dangKy = (await getBee().listRepos()).find((r) => r.slug === input.repoSlug);
    if (!dangKy) {
      return { ok: false, message: "This repository is not registered. Add it to repos.d first." };
    }
    slug = dangKy.slug;
    repo = dangKy.repo;
  }

  const daCo = await getBee().listSessions();
  const num = daCo.filter((p) => p.slug === slug).length + 1;

  const ket = await moPhien({
    slug,
    num,
    repo,
    // Untitled on purpose — the first chat message names the session
    // (auto-title in session-ctl), like Claude Code does.
    title: null,
    worktree,
  });
  if (!ket.ok) return ket;

  revalidatePath("/sessions");
  revalidatePath("/canvas");
  // Trả luôn phiên vừa mở — canvas cần nó để mở panel tại chỗ không round-trip.
  const phien = await getBee().readSession(ket.id);
  return { ok: true, id: ket.id, phien };
}

export async function guiVaoPhien(id: string, text: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  // "/build args" expands to the command file's body REPL-style; the
  // history still shows what was typed. Plain text passes through as-is.
  const moRong = await expandCommandText(
    path.join(process.env.HOME ?? "", ".claude", "commands"),
    text.trim(),
  );
  const ket = await noiVaoPhien(id, moRong, text);
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

export async function dungPhienAction(id: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await dungPhien(id);
  revalidatePath("/sessions");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

