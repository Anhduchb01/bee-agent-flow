import { redirect } from "next/navigation";

import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { deriveHealth } from "@/features/health";
import { loadInbox } from "@/features/inbox";
import { loadProjects } from "@/features/project";
import { AppSidebar, type DuAnTrongSidebar } from "@/features/shell";
import { auth, getActor, signOut } from "@/lib/auth";
import { getBee } from "@/lib/bee";

/**
 * Cổng chung của mọi màn hình có dữ liệu, và là nơi dựng vỏ sidebar.
 *
 * Người ngoài allowlist **đăng nhập thành công** — đó là hành vi đúng, không
 * phải lỗi — nhưng không có màn hình dữ liệu nào được dựng cho họ, và cũng
 * không có sidebar: sidebar chứa tên dự án, tức đã là dữ liệu.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.login) redirect("/dang-nhap");

  async function raNgoai() {
    "use server";
    await signOut({ redirectTo: "/dang-nhap" });
  }

  if (!session.allowed) {
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

  const actor = await getActor();
  const [projects, items, statusRead] = await Promise.all([
    loadProjects(),
    actor ? loadInbox(actor) : Promise.resolve([]),
    getBee().readStatus(),
  ]);
  const health = deriveHealth(statusRead);

  const duAn: DuAnTrongSidebar[] = projects.map((p) => ({
    slug: p.slug,
    dangChay: p.running.length,
    tone: p.repo === null ? "idle" : p.repo.paused ? "warn" : p.running.length > 0 ? "agent" : "ok",
  }));

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          displayName={session.displayName}
          login={session.login}
          role={session.role}
          soViecChoBan={items.length}
          duAn={duAn}
          sucKhoe={{
            tone: health.level === "ok" ? "ok" : health.level === "warn" ? "warn" : "down",
            headline: health.headline,
            detail: health.slots
              ? `build ${health.slots.build.used}/${health.slots.build.max} · hàng đợi ${health.queued}`
              : null,
          }}
          dangXuat={raNgoai}
        />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
