"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth";
import { getGithub } from "@/lib/github";

export type KetQuaThemDuAn =
  | { ok: true; slug: string }
  | { ok: false; message: string };

/**
 * Thêm dự án.
 *
 * App **không** chạy `be repo add` — nó không có sudo, không có token orch, và
 * không được sửa state của reconciler. Nó chỉ ghi nhận dự án ở phía app; máy
 * chỉ bắt đầu làm việc trên repo đó sau khi có người chạy lệnh trên Ubuntu.
 * Giữa hai thời điểm ấy, thẻ dự án mang nhãn "reconciler chưa biết dự án này" —
 * một sự thật cần nói ra chứ không phải chi tiết cần giấu.
 */
export async function themDuAn(full: string): Promise<KetQuaThemDuAn> {
  const actor = await getActor();
  if (!actor) return { ok: false, message: "You are not allowed to do this." };

  try {
    const repo = await getGithub().addRepo(full, actor);
    revalidatePath("/du-an");
    return { ok: true, slug: repo.slug };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not add the project." };
  }
}
