import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Dải đầu trang: nút thu sidebar, tiêu đề, rồi **một** hành động chính bên phải.
 *
 * Tiêu đề ở đây là 20px chứ không phải 32px như trước. Khi điều hướng đã nằm ở
 * sidebar thì tiêu đề không còn phải gánh việc "cho biết mình đang ở đâu" nữa —
 * nó chỉ cần đặt tên cho trang.
 */
export function PageHeader({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4" />
      {/* Auto-titled sessions can be a whole sentence — truncate on phones. */}
      <h1 className="min-w-0 truncate text-xl font-semibold tracking-heading text-foreground">
        {title}
      </h1>
      {meta ? <div className="hidden items-center gap-2 sm:flex">{meta}</div> : null}
      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </header>
  );
}
