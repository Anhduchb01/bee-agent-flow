"use client";

import {
  CircleGaugeIcon,
  KanbanIcon,
  SunriseIcon,
  LogOutIcon,
  PlusIcon,
  TerminalIcon,
  WaypointsIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { StatusDot, type Tone } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

/**
 * The "+" button next to Projects — exported so the server layout can wrap
 * it in setup's dialog while its styling stays here with the rest of the
 * sidebar. after:-inset-3 lifts the tap target from 36px to 44px (Apple's
 * floor) without moving the 20px icon; md:after:hidden in the base class
 * keeps the mouse behaviour unchanged.
 */
export function SidebarNewProjectTrigger(props: React.ComponentProps<"button">) {
  return (
    <SidebarGroupAction
      title="New project"
      aria-label="New project"
      className="after:-inset-3"
      {...props}
    >
      <PlusIcon />
    </SidebarGroupAction>
  );
}

export interface SidebarProject {
  slug: string;
  running: number;
  tone: Tone;
}

export interface HealthSummary {
  tone: Tone;
  headline: string;
  detail: string | null;
}

/**
 * Vỏ điều hướng.
 *
 * Danh sách dự án nằm **ngay trong sidebar** chứ không sau một trang trung
 * gian: nhảy giữa các dự án là thao tác PM làm nhiều nhất trong ngày, và ở bố
 * cục cũ nó tốn ba bước.
 *
 * Sức khoẻ hệ thống nằm ở chân, một dòng. Luôn nhìn thấy mà không chiếm chỗ của
 * nội dung — chỉ khi có chuyện nó mới đổi màu.
 */
export function AppSidebar({
  displayName,
  login,
  sidebarProjects,
  health,
  signingOut,
  newProjectButton,
}: {
  displayName: string;
  login: string;
  sidebarProjects: SidebarProject[];
  health: HealthSummary;
  signingOut: () => Promise<void>;
  /** The "+" — composed by the server layout, see below. */
  newProjectButton?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  /**
   * On a phone the sidebar IS a sheet over the page, and nothing used to
   * close it: tapping a project or the + navigated underneath while the
   * sheet stayed up, so the whole Projects section read as "not tappable".
   * Every link in here closes it on the way out. Desktop is untouched —
   * there the sidebar is not covering anything.
   */
  function closeOnPhone() {
    if (isMobile) setOpenMobile(false);
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:px-0">
          <span aria-hidden className="text-base">
            🐝
          </span>
          <span className="text-base font-semibold tracking-title text-foreground group-data-[collapsible=icon]:hidden">
            bee
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-body group-data-[collapsible=icon]:hidden">
            <span title={login}>{displayName}</span>
          </span>
        </div>

        {/*
         * Từng có một ô "Quick search…" kèm gợi ý ⌘K ở đây, `disabled`. Bỏ đi:
         * một affordance nhìn thấy được mà bấm không làm gì thì tệ hơn là không
         * có — nó dạy người dùng rằng chỗ này không đáng tin.
         *
         * Muốn nối lại thì dùng `Command` trong `Dialog` của shadcn, liệt kê dự
         * án + task đang mở.
         */}
      </SidebarHeader>

      <SidebarContent>
        {/* Sidebar của shadcn chỉ dựng <div>. Bọc lại thành landmark điều hướng
            để trình đọc màn hình nhảy thẳng vào được. */}
        <nav aria-label="Main navigation" className="contents">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/"}
                  tooltip="Overview"
                  onClick={closeOnPhone}
                  render={<Link href="/" />}
                >
                  <CircleGaugeIcon />
                  <span>Overview</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/sessions")}
                  tooltip="Sessions"
                  onClick={closeOnPhone}
                  render={<Link href="/sessions" />}
                >
                  <TerminalIcon />
                  <span>Sessions</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/projects")}
                  tooltip="Projects"
                  onClick={closeOnPhone}
                  render={<Link href="/projects" />}
                >
                  <KanbanIcon />
                  <span>Projects</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/brief")}
                  tooltip="Activity"
                  onClick={closeOnPhone}
                  render={<Link href="/brief" />}
                >
                  <SunriseIcon />
                  <span>Activity</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/canvas")}
                  tooltip="Canvas"
                  onClick={closeOnPhone}
                  render={<Link href="/canvas" />}
                >
                  <WaypointsIcon />
                  <span>Canvas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/setup")}
                  tooltip="Setup"
                  onClick={closeOnPhone}
                  render={<Link href="/setup" />}
                >
                  <WrenchIcon />
                  <span>Setup</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          {/* The + comes in as a NODE from the server layout, not as an
              import: it opens setup's dialog, and setup's barrel carries
              server-only loaders that a "use client" file may not pull in
              (the cross-feature lint rule forbids reaching past a barrel,
              so composition upstairs is the only honest way). */}
          {newProjectButton}
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarProjects.map((d) => (
                <SidebarMenuItem key={d.slug}>
                  <SidebarMenuButton
                    tooltip={d.slug}
                    onClick={closeOnPhone}
                    // Tapping a project opens the board FILTERED to it —
                    // it used to send every project to the same unfiltered
                    // /sessions page, which made the list decorative.
                    render={<Link href={`/projects?p=${d.slug}`} />}
                  >
                    <StatusDot tone={d.tone} />
                    <span>{d.slug}</span>
                  </SidebarMenuButton>
                  {d.running > 0 ? (
                    <SidebarMenuBadge>{d.running}</SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex flex-col gap-1 px-2 py-1 group-data-[collapsible=icon]:hidden">
          <span className="flex items-center gap-2 text-xs text-body">
            <StatusDot tone={health.tone} />
            {health.headline}
          </span>
          {health.detail ? (
            <span className="font-mono text-xs text-muted-foreground">{health.detail}</span>
          ) : null}
        </div>

        <form action={signingOut}>
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            <LogOutIcon data-icon="inline-start" />
            <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
          </Button>
        </form>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
