"use server";

import { revalidatePath } from "next/cache";

import { getActorWithToken } from "@/lib/auth/token";
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
  // `getActorWithToken` chứ không phải `getActor`: đường GHI cần access token
  // của người vừa bấm, mà `getActor()` cố ý không mang nó (token nằm trong JWT
  // và `fillSession` xoá khỏi session để không có đường nào ra client). Dùng
  // nhầm hàm thì trên fixture vẫn chạy trơn tru, còn `GITHUB_SOURCE=live` đổ ở
  // mọi thao tác ghi — một lỗi chỉ lộ ra sau khi đã lên máy thật.
  const actor = await getActorWithToken();
  if (!actor) return { ok: false, message: "You are not allowed to do this." };

  try {
    const repo = await getGithub().addRepo(full, actor);
    revalidatePath("/projects");
    return { ok: true, slug: repo.slug };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not add the project." };
  }
}
