import { cn } from "@/lib/utils";

/**
 * Nhãn khu vực: Geist Mono, viết HOA, 12px.
 *
 * Đây là một trong đúng hai việc của Geist Mono trong hệ này — việc còn lại là
 * mã. Nó đọc như tiêu đề của một bản spec kỹ thuật, và đó chính là hiệu ứng
 * Vercel muốn: trang trông như tài liệu, chỉ tình cờ là một sản phẩm.
 */
export function Eyebrow({
  children,
  className,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "h2" | "h3" | "p" | "span";
}) {
  return <Tag className={cn("eyebrow", className)}>{children}</Tag>;
}
