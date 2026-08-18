import { redirect } from "next/navigation";

import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { deriveHealth } from "@/features/health";
import { loadProjects } from "@/features/project";
import { AppSidebar, type DuAnTrongSidebar } from "@/features/shell";
import { auth, signOut } from "@/lib/auth";
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
  if (!session?.login) redirect("/login");

  async function raNgoai() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  if (!session.allowed) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-24">
        <PageTitle
          title="You do not have access yet"
          hint={`Signed in as ${session.login}, but that account is not on the allowlist.`}
        />
        <p className="text-sm text-body">
          Ask a PM or Techlead to add your login to <code>ALLOWED_LOGINS</code>.
        </p>
        <form action={raNgoai}>
          <Button type="submit" variant="outline">
            Sign in with a different account
          </Button>
        </form>
      </main>
    );
  }

  const [projects, statusRead, sessions] = await Promise.all([
    loadProjects(),
    getBee().readStatus(),
    getBee().listSessions(),
  ]);
  const health = deriveHealth(statusRead);
  const running = sessions.filter((s) => s.status === "running").length;

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
          duAn={duAn}
          sucKhoe={{
            tone: health.level === "ok" ? "ok" : health.level === "warn" ? "warn" : "down",
            headline: health.headline,
            detail: `${running} sessions running`,
          }}
          dangXuat={raNgoai}
        />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
