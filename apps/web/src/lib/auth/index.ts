import NextAuth from "next-auth";
// Import rỗng: đủ để TypeScript tìm thấy module cho khối `declare module` bên
// dưới, mà không tạo ra một binding nào không dùng tới.
import type {} from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";

import { PM, TL } from "@/lib/fixtures/github";
import type { Actor } from "@/lib/github/types";

import type { Role } from "./allowlist";
import { fillSession, fillToken } from "./callbacks";

/**
 * Token của người dùng nằm trong JWT — tức trong cookie httpOnly đã mã hoá — và
 * **không bao giờ đi qua `session()`**. Trình duyệt không được cầm một thứ ghi
 * được lên GitHub; route handler đọc nó phía server rồi tự gọi.
 */
declare module "next-auth" {
  interface Session {
    login: string;
    displayName: string;
    /** Đăng nhập thành công vẫn có thể `false` — xem allowlist.ts. */
    allowed: boolean;
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    login?: string;
    displayName?: string;
    avatar_url?: string;
    /** Chỉ đọc phía server. Không có đường nào từ đây ra client. */
    access_token?: string;
  }
}

const isLive = process.env.GITHUB_SOURCE === "live";

/**
 * Provider giả chỉ tồn tại khi **không** chạy dữ liệu thật.
 *
 * Nó cho đăng nhập bằng một dòng chữ, nên nếu nó sống sót sang bản chạy thật
 * thì allowlist trở thành vô nghĩa. Điều kiện tắt vì vậy bám vào cùng biến đã
 * quyết định nguồn dữ liệu, chứ không phải một cờ riêng ai đó có thể quên.
 */
const devProvider = Credentials({
  id: "dev",
  name: "Đăng nhập thử",
  credentials: { login: { label: "GitHub login", type: "text" } },
  authorize: async (creds) => {
    const login = String(creds?.login ?? "").trim();
    if (!login) return null;
    const known = [PM, TL].find((u) => u.login === login);
    return {
      id: login,
      name: known?.name ?? login,
      image: known?.avatar_url ?? null,
      login,
    };
  },
});

/**
 * Chạy thật mà thiếu `AUTH_SECRET` thì NextAuth phải ném lỗi — đó là hành vi
 * đúng. Khoá mặc định chỉ dành cho fixture, và nó nằm trong mã nguồn công khai
 * nên không có gì để mất: cùng biến đã tắt provider giả cũng chặn nó ở đây.
 */
const secret = process.env.AUTH_SECRET ?? (isLive ? undefined : "bee-fixture-khong-bi-mat");

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: isLive ? [GitHub] : [devProvider],
  session: { strategy: "jwt" },
  secret,
  // App chạy sau Cloudflare Access trên tên miền riêng, không phải trên Vercel.
  trustHost: true,
  pages: { signIn: "/dang-nhap" },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      return fillToken(token, {
        profile,
        user: user as { login?: unknown; name?: unknown; image?: unknown } | undefined,
        accessToken: account?.access_token,
      });
    },

    async session({ session, token }) {
      return fillSession(session, token);
    },
  },
});

/**
 * Người đang đăng nhập, hoặc `null` nếu chưa đăng nhập / không có trong
 * allowlist. Hai trường hợp đó trả về cùng một thứ **cho tầng dữ liệu** — người
 * ngoài allowlist không thấy gì — nhưng màn hình phân biệt được qua `auth()`.
 *
 * Mọi route handler tự gọi hàm này. `proxy.ts` chỉ là trải nghiệm, không phải
 * bảo mật: Next đã từng có CVE bỏ qua middleware (CVE-2025-29927).
 */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.allowed || !session.login) return null;
  return {
    login: session.login,
    name: session.displayName,
    avatar_url: "",
    role: session.role,
  };
}

export { isAllowed, roleOf } from "./allowlist";
export type { Role } from "./allowlist";
