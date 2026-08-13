"use client";

import {
  CircleGaugeIcon,
  InboxIcon,
  LogOutIcon,
  PlusIcon,
  SearchIcon,
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
} from "@/components/ui/sidebar";

export interface DuAnTrongSidebar {
  slug: string;
  dangChay: number;
  tone: Tone;
}

export interface SucKhoeTomTat {
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
  role,
  soViecChoBan,
  duAn,
  sucKhoe,
  dangXuat,
}: {
  displayName: string;
  login: string;
  role: "pm" | "tl";
  soViecChoBan: number;
  duAn: DuAnTrongSidebar[];
  sucKhoe: SucKhoeTomTat;
  dangXuat: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:px-0">
          <span className="text-base font-semibold tracking-title text-foreground group-data-[collapsible=icon]:hidden">
            bee
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-body group-data-[collapsible=icon]:hidden">
            <span title={login}>{displayName}</span>
            <span className="rounded-pill border px-1.5 py-0.5 font-mono text-[0.6875rem] uppercase">
              {role}
            </span>
          </span>
        </div>

        {/* Ô tìm hiện sẵn phím tắt: vấn đề lớn nhất của command palette là
            không ai biết nó tồn tại. Chưa nối — xem tasks/todo.md. */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton disabled tooltip="Quick search (coming soon)">
              <SearchIcon />
              <span>Quick search…</span>
              <SidebarMenuBadge className="font-mono">⌘K</SidebarMenuBadge>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
                  render={<Link href="/" />}
                >
                  <CircleGaugeIcon />
                  <span>Overview</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/viec"}
                  tooltip="Your work"
                  render={<Link href="/viec" />}
                >
                  <InboxIcon />
                  <span>Your work</span>
                </SidebarMenuButton>
                {soViecChoBan > 0 ? (
                  <SidebarMenuBadge>{soViecChoBan}</SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupAction title="Add project" render={<Link href="/du-an" />}>
            <PlusIcon />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {duAn.map((d) => (
                <SidebarMenuItem key={d.slug}>
                  <SidebarMenuButton
                    isActive={pathname === `/p/${d.slug}`}
                    tooltip={d.slug}
                    render={<Link href={`/p/${d.slug}`} />}
                  >
                    <StatusDot tone={d.tone} />
                    <span>{d.slug}</span>
                  </SidebarMenuButton>
                  {d.dangChay > 0 ? (
                    <SidebarMenuBadge>{d.dangChay}</SidebarMenuBadge>
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
            <StatusDot tone={sucKhoe.tone} />
            {sucKhoe.headline}
          </span>
          {sucKhoe.detail ? (
            <span className="font-mono text-xs text-muted-foreground">{sucKhoe.detail}</span>
          ) : null}
        </div>

        <form action={dangXuat}>
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
