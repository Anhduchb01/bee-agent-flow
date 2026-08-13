import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/task-stage";

import type { HonHopDuAn } from "../lib/project-mix";

/** Sáu màu rút từ bảng của Vercel — xem docs/design/vercel-geist.md §3. */
const MAU: Record<Stage, string> = {
  nhap: "bg-faint",
  "cho-spec": "bg-link/40",
  "cho-giao": "bg-warning",
  "agent-lam": "bg-violet",
  "cho-duyet": "bg-link",
  "can-nguoi": "bg-destructive",
};

function ChuGiai() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {STAGES.map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden className={`size-2.5 rounded-[3px] ${MAU[s]}`} />
          {STAGE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

/**
 * Phân bố task theo giai đoạn, mỗi dự án một thanh.
 *
 * Đây là thứ thay cho cột "tổng số task". Nhìn ngang là thấy dự án nào đang dồn
 * ở đâu: một dự án 2 task mà một nửa kẹt ở "cần người" và một dự án 8 task đang
 * chạy ngon là hai tình huống đòi hai hành động khác nhau — mà một con số tổng
 * thì không phân biệt được.
 */
export function ProjectMixPanel({ duAn }: { duAn: HonHopDuAn[] }) {
  const coTask = duAn.filter((d) => d.tong > 0);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b bg-muted/30 px-5 py-3.5">
        <CardTitle className="text-base tracking-title">Dự án</CardTitle>
        <CardDescription>
          <ChuGiai />
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col px-0">
        {coTask.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>Chưa có task nào đang mở</EmptyTitle>
              <EmptyDescription>Tạo task đầu tiên từ trang dự án.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          coTask.map((d) => (
            <div
              key={d.slug}
              className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-5 border-b px-5 py-4 last:border-b-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link
                  href={`/p/${d.slug}`}
                  className="truncate text-sm font-semibold tracking-title text-foreground underline-offset-4 hover:underline"
                >
                  {d.slug}
                </Link>
                <span className="truncate font-mono text-xs text-muted-foreground">{d.full}</span>
              </div>

              <div className="flex min-w-0 flex-col gap-2.5">
                <div
                  className="flex h-3 overflow-hidden rounded-pill bg-muted"
                  role="img"
                  aria-label={`${d.slug}: ${d.khuc.map((k) => `${k.so} ${k.label.toLowerCase()}`).join(", ")}`}
                >
                  {d.khuc.map((k) => (
                    <span key={k.stage} className={MAU[k.stage]} style={{ flex: k.so }} />
                  ))}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-body">
                  {d.khuc.map((k) => (
                    <span key={k.stage}>
                      <span className="font-mono font-medium text-foreground">{k.so}</span>{" "}
                      {k.label.toLowerCase()}
                    </span>
                  ))}
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono text-xl leading-none tabular-nums tracking-title text-foreground">
                  {d.tong}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">task mở</div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
