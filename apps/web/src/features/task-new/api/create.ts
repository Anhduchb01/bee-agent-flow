"use server";

import { getActor } from "@/lib/auth";
import { getGithub } from "@/lib/github";

import { taskFormSchema } from "../schemas/task-form";

export type KetQuaTao =
  | { ok: true; slug: string; number: number; url: string }
  | { ok: false; errors: Record<string, string> };

/**
 * Tạo issue bằng danh tính của người bấm, gắn `status:ready-for-spec` để rule 08
 * chấm ở tick sau.
 *
 * Kiểm lại bằng cùng schema mà form đã kiểm. Kiểm ở client là để người dùng đỡ
 * mất công gửi đi rồi mới biết sai; nó không phải là chốt chặn — một request
 * tự soạn đi thẳng vào đây mà không qua form nào cả.
 */
export async function taoTask(raw: Record<string, string>): Promise<KetQuaTao> {
  const actor = await getActor();
  if (!actor) return { ok: false, errors: { slug: "Bạn không có quyền tạo task." } };

  const parsed = taskFormSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "slug");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const task = await getGithub().createTask(parsed.data, actor);
  return { ok: true, slug: task.slug, number: task.number, url: task.url };
}
