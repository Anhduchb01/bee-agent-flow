import { redirect } from "next/navigation";

import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { deriveHealth } from "@/features/health";
import { NewProjectDialog } from "@/features/setup";
import {
  AppSidebar,
  SidebarNewProjectTrigger,
  type SidebarProject,
} from "@/features/shell";
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

  async function signOutAction() {
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
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign in with a different account
          </Button>
        </form>
      </main>
    );
  }

  // Sidebar projects = REGISTERED repos (repos.d) — the same source the
  // session combobox uses. The legacy loadProjects/status.json path showed
  // an empty list on the new runner while the combobox listed repos fine.
  const [repos, statusRead, sessions] = await Promise.all([
    getBee().listRepos(),
    getBee().readStatus(),
    getBee().listSessions(),
  ]);
  const health = deriveHealth(statusRead);
  const running = sessions.filter((s) => s.status === "running").length;

  const sidebarProjects: SidebarProject[] = repos.map((r) => {
    const running = sessions.filter(
      (s) => s.slug === r.slug && s.status === "running",
    ).length;
    return { slug: r.slug, running, tone: running > 0 ? "agent" : "ok" };
  });

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          /* Composed here, in a SERVER component: the dialog lives in the
             setup feature next to the action it calls, and the sidebar
             (a client component) must not import that barrel — it carries
             server-only loaders. */
          nutTaoDuAn={<NewProjectDialog trigger={<SidebarNewProjectTrigger />} />}
          displayName={session.displayName}
          login={session.login}
          sidebarProjects={sidebarProjects}
          sucKhoe={{
            tone: health.level === "ok" ? "ok" : health.level === "warn" ? "warn" : "down",
            headline: health.headline,
            detail: `${running} sessions running`,
          }}
          signingOut={signOutAction}
        />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
