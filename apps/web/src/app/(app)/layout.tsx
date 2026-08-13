import { redirect } from "next/navigation";

import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { auth, signOut } from "@/lib/auth";

import { AppHeader } from "./_components/app-header";

/**
 * Cổng chung của mọi màn hình có dữ liệu.
 *
 * Người ngoài allowlist **đăng nhập thành công** — đó là hành vi đúng, không
 * phải lỗi — nhưng không có màn hình dữ liệu nào được dựng cho họ. Chặn ở đây
 * chứ không phải ở từng trang, và mỗi route handler vẫn tự kiểm lại bằng
 * `getActor()` vì layout không chạy trước route handler.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.login) redirect("/dang-nhap");

  if (!session.allowed) {
    async function raNgoai() {
      "use server";
      await signOut({ redirectTo: "/dang-nhap" });
    }

    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-24">
        <PageTitle
          title="Bạn chưa có quyền vào đây"
          hint={`Đăng nhập thành công với tài khoản ${session.login}, nhưng tài khoản này chưa nằm trong danh sách được phép.`}
        />
        <p className="text-sm text-body">
          Nhờ PM hoặc Techlead thêm login của bạn vào <code>ALLOWED_LOGINS</code>.
        </p>
        <form action={raNgoai}>
          <Button type="submit" variant="outline">
            Đăng nhập bằng tài khoản khác
          </Button>
        </form>
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        displayName={session.displayName}
        login={session.login}
        role={session.role}
      />
      {children}
    </div>
  );
}
