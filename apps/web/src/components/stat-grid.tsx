import { StatusDot, type Tone } from "@/components/status-dot";
import { cn } from "@/lib/utils";

export interface Stat {
  label: string;
  value: string;
  /** Dòng nhỏ dưới con số. Dùng để trả lời "con số này nghĩa là gì". */
  hint?: string;
  tone?: Tone;
}

/**
 * Dải thống kê đầu mỗi màn hình.
 *
 * Một thẻ viền tóc duy nhất chia ô bằng đường kẻ dọc, không phải bốn thẻ rời —
 * bốn thẻ rời tạo ra bốn khối trôi nổi, còn một thẻ chia ô đọc như một bảng
 * chỉ số. Nhãn bằng Geist Mono viết hoa, con số bằng chữ số đều bề rộng
 * (`tabular-nums`) để chúng thẳng cột khi đổi giá trị.
 *
 * Không biết gì về nghiệp vụ — mỗi màn tự tính ra `Stat[]` của mình.
 */
export function StatGrid({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-card border border-border bg-card sm:grid-cols-4",
        className,
      )}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            "flex flex-col gap-1.5 px-5 py-4",
            // Đường kẻ vẽ bằng viền của chính ô, không bằng `divide-x`: ở lưới
            // 2 cột trên điện thoại, `divide-x` kẻ nhầm cả những chỗ xuống dòng.
            i % 2 === 1 && "border-l border-border",
            i >= 2 && "border-t border-border",
            "sm:border-t-0",
            i > 0 && "sm:border-l sm:border-border",
          )}
        >
          <dt className="eyebrow">{s.label}</dt>
          <dd className="flex items-center gap-2">
            {s.tone ? <StatusDot tone={s.tone} /> : null}
            <span className="font-mono text-2xl leading-none tabular-nums tracking-title text-foreground">
              {s.value}
            </span>
          </dd>
          {s.hint ? <p className="text-xs text-muted-foreground">{s.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}
