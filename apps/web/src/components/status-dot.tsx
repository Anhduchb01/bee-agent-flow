import { cn } from "@/lib/utils";

/**
 * Chấm trạng thái 6px.
 *
 * Đây là cách app này được phép dùng màu: một chấm, một đường viền, một dòng
 * chữ — không bao giờ là một mảng nền. Geist cấm đổ màu accent lên bề mặt rộng,
 * nhưng phân biệt được đỏ với xanh ở đây là **thông tin**, không phải trang
 * trí. Chấm là liều lượng nhỏ nhất còn đọc được.
 */
export type Tone = "ok" | "warn" | "down" | "agent" | "idle";

const TONE: Record<Tone, string> = {
  ok: "bg-link",
  warn: "bg-warning",
  down: "bg-destructive",
  agent: "bg-violet",
  idle: "bg-faint",
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE[tone], className)} />
  );
}
