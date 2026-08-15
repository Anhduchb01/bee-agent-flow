"use server";

import { getActorWithToken } from "@/lib/auth/token";
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
  // `getActorWithToken` chứ không phải `getActor`: đường GHI cần access token
  // của người vừa bấm, mà `getActor()` cố ý không mang nó (token nằm trong JWT
  // và `fillSession` xoá khỏi session để không có đường nào ra client). Dùng
  // nhầm hàm thì trên fixture vẫn chạy trơn tru, còn `GITHUB_SOURCE=live` đổ ở
  // mọi thao tác ghi — một lỗi chỉ lộ ra sau khi đã lên máy thật.
  const actor = await getActorWithToken();
  if (!actor) return { ok: false, errors: { slug: "You are not allowed to create tasks." } };

  const parsed = taskFormSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "slug");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  // Đường GHI cũng gặp 401 như đường đọc, và ở đây nó đắt hơn: người dùng vừa
  // phỏng vấn xong cả một hợp đồng. Trả về lỗi đọc được thay vì ném ra error
  // boundary — nội dung chat vẫn còn nguyên trên màn hình để họ bấm lại.
  try {
    const task = await getGithub().createTask(parsed.data, actor);
    return { ok: true, slug: task.slug, number: task.number, url: task.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      errors: {
        slug: /401|rejected the token/i.test(msg)
          ? "GitHub no longer accepts your session. Sign out and back in, then press Create task again — the draft above stays."
          : msg,
      },
    };
  }
}
