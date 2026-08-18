"use server";

import { revalidatePath } from "next/cache";

import { getActorWithToken } from "@/lib/auth/token";
import { getGithub } from "@/lib/github";

export interface KetQua {
  ok: boolean;
  message: string;
}

/**
 * Mọi hành động ở đây tự kiểm session, không tin `proxy.ts`, và ghi lên GitHub
 * bằng danh tính của **người vừa bấm**. Không có token bot dùng chung: dấu vết
 * kiểm toán chỉ đúng khi nó mang tên người thật.
 */
async function nguoiBam() {
  // `getActorWithToken` chứ không phải `getActor`: đường GHI cần access token
  // của người vừa bấm, mà `getActor()` cố ý không mang nó (token nằm trong JWT
  // và `fillSession` xoá khỏi session để không có đường nào ra client). Dùng
  // nhầm hàm thì trên fixture vẫn chạy trơn tru, còn `GITHUB_SOURCE=live` đổ ở
  // mọi thao tác ghi — một lỗi chỉ lộ ra sau khi đã lên máy thật.
  const actor = await getActorWithToken();
  if (!actor) throw new Error("You are not allowed to do this.");
  return actor;
}

function lamMoi(slug: string, num: number) {
  revalidatePath(`/t/${slug}/${num}`);
  revalidatePath("/");
}

/** Approve the PR on GitHub under the name of the person who clicked. */
export async function duyetPR(slug: string, num: number): Promise<KetQua> {
  const actor = await nguoiBam();

  await getGithub().approve(slug, num, actor);
  lamMoi(slug, num);

  return { ok: true, message: "Approved" };
}
