import "server-only";

import { headers } from "next/headers";

import { getToken } from "next-auth/jwt";

import { roleOf } from "./allowlist";
import { FIXTURE_SECRET } from "./secret";
import { isAllowed } from "./allowlist";
import type { Actor } from "@/lib/github/types";

/**
 * Người đang đăng nhập **kèm access token** — chỉ dùng ở tầng dữ liệu.
 *
 * Vì sao không lấy từ `auth()`: token nằm trong JWT (cookie httpOnly đã mã hoá)
 * và `fillSession` chủ động `delete` nó khỏi session, để không có đường nào từ
 * đó ra client. Muốn token thì phải giải mã JWT thô, và đó chính là hàm này.
 *
 * `getActor()` vẫn là hàm mọi chỗ khác nên gọi. Hàm này chỉ dành cho chỗ thật
 * sự phải nói chuyện với GitHub — nếu nó bắt đầu xuất hiện trong component thì
 * ranh giới đã hỏng.
 */
export async function getActorWithToken(): Promise<Actor | null> {
  const secret = process.env.AUTH_SECRET ?? FIXTURE_SECRET;
  const token = await getToken({
    // `getToken` chỉ cần đọc header cookie. Dựng một req tối thiểu thay vì kéo
    // cả `Request` xuống đây, vì server component không có sẵn một cái nào.
    req: { headers: await headers() } as unknown as Request,
    secret,
    // Cookie đổi tên theo scheme; để `getToken` tự đoán thì nó đoán theo
    // NEXTAUTH_URL, mà app chạy sau Cloudflare Access nên biến đó không đáng tin.
    secureCookie: process.env.AUTH_URL?.startsWith("https://") ?? false,
  });

  const login = token?.login ?? "";
  if (!login || !isAllowed(login)) return null;

  return {
    login,
    name: token?.displayName ?? login,
    avatar_url: token?.avatar_url ?? "",
    role: roleOf(login),
    token: token?.access_token,
  };
}
