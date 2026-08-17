"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";
import { chuyenSangLam, dungPhien, moPhien, noiVaoPhien } from "@/lib/bee/session-ctl";

export type KetQuaMoPhien = { ok: true; id: string } | { ok: false; message: string };
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
export async function batDauPhien(input: { repo: string; title: string }): Promise<KetQuaMoPhien> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: KHONG_QUYEN.message };

  const repo = input.repo.trim();
  const phanTen = repo.split("/")[1] ?? "";
  const slug = phanTen.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  if (slug === "") return { ok: false, message: "Repository must look like owner/name." };

  const daCo = await getBee().listSessions();
  const num = daCo.filter((p) => p.slug === slug).length + 1;

  const ket = await moPhien({ slug, num, repo, title: input.title.trim() || `Session ${num}` });
  if (ket.ok) revalidatePath("/sessions");
  return ket;
}

export async function guiVaoPhien(id: string, text: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await noiVaoPhien(id, text);
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

export async function dungPhienAction(id: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await dungPhien(id);
  revalidatePath("/sessions");
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}

/** "OK, do it" — cửa chặn duy nhất: đổi phase, runner làm phần còn lại. */
export async function okLamDiAction(id: string): Promise<KetQua> {
  const actor = await getActor();
  if (!actor) return KHONG_QUYEN;
  const ket = await chuyenSangLam(id);
  revalidatePath(`/sessions/${id}`);
  return ket.ok ? { ok: true, message: "" } : { ok: false, message: ket.message };
}
