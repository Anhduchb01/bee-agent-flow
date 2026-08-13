import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * Ở Next 16 file này thay cho `middleware.ts`.
 *
 * **Đây là trải nghiệm, không phải bảo mật.** Nó chỉ để người chưa đăng nhập
 * không phải nhìn một trang rỗng rồi tự đoán. Next đã từng ship CVE bỏ qua
 * middleware bằng một header (CVE-2025-29927), nên mọi route handler và mọi
 * page vẫn tự kiểm session bằng `getActor()`.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  const open =
    pathname.startsWith("/dang-nhap") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next");

  if (open || req.auth) return NextResponse.next();

  const url = new URL("/dang-nhap", req.nextUrl);
  url.searchParams.set("tiep-tuc", pathname);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
