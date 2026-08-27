import "server-only";

import { cookies } from "next/headers";

/** Cookie chọn cảnh. Không nguồn thật nào đọc nó, nên trên máy thật nó vô nghĩa. */
export const SCENE_COOKIE = "bee-scene";

/**
 * Cảnh nào đang được dùng — chuyện của **riêng tầng fixture**.
 *
 * Ở chung một chỗ cho mọi đường ranh dữ liệu, vì một cảnh chỉ có nghĩa khi tất
 * cả các nguồn cùng kể một câu chuyện: "vừa cài xong" mà `lib/bee` nói chưa có
 * repo nào còn `lib/claude` nói đã tiêu 1.24M token hôm nay thì cảnh đó không
 * duyệt được.
 *
 * Cookie đứng trước biến môi trường để đi qua đủ năm cảnh không phải khởi động
 * lại app. Đọc ở đây chứ không ở màn hình là điều giữ cho đường ranh còn nguyên:
 * không component nào biết mình đang xem fixture.
 */
export async function currentScene(): Promise<string> {
  try {
    const fromCookie = (await cookies()).get(SCENE_COOKIE)?.value;
    if (fromCookie) return fromCookie;
  } catch {
    // Ngoài ngữ cảnh request (test, script) thì không có cookie — dùng env.
  }
  return process.env.BEE_FIXTURE_SCENE ?? "binh-thuong";
}

/** Cảnh mô tả một máy chưa từng chạy rule nào: chưa có repo, hoặc chưa có file. */
export function neverRan(activeScene: string): boolean {
  return activeScene === "vua-cai" || activeScene === "chua-co-file";
}
