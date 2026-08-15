"use server";

import { getActorWithToken } from "@/lib/auth/token";
import { docPhien, luuPhien, type PhienChat } from "@/lib/chat-store";

/**
 * Ghi nhận một phiên chat để mở lại sau.
 *
 * Không có token GitHub nào bị dùng ở đây, nhưng vẫn kiểm người bấm: đây là
 * một đường GHI, và một endpoint ai gọi cũng được sẽ để người lạ bơm rác vào
 * lịch sử của dự án.
 */
export async function ghiNhoPhien(
  slug: string,
  sessionId: string,
  title: string,
): Promise<void> {
  const actor = await getActorWithToken();
  if (!actor) return;

  await luuPhien(slug, {
    session_id: sessionId,
    // Cắt ở đây chứ không ở lúc hiển thị: file lịch sử không có lý do gì để
    // chứa cả một đoạn văn.
    title: title.trim().slice(0, 120) || "(không có tiêu đề)",
    at: new Date().toISOString(),
    login: actor.login,
  } satisfies PhienChat);
}

export async function docLichSuChat(slug: string): Promise<PhienChat[]> {
  const actor = await getActorWithToken();
  if (!actor) return [];
  return docPhien(slug);
}
