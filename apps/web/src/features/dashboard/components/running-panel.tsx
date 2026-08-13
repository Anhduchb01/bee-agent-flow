import Link from "next/link";

import { StatusDot } from "@/components/status-dot";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { BeeRunning } from "@/lib/bee/types";
import { khoangThoiGian } from "@/lib/duration";

export interface ViecDangChay extends BeeRunning {
  title: string | null;
}

/**
 * Việc reconciler đang chạy, kèm đồng hồ.
 *
 * Thứ duy nhất trên màn hình này thay đổi theo thời gian thực, nên nó đáng một
 * khối riêng. Con số slot ở phần mô tả trả lời câu đi liền sau: *còn chỗ cho
 * việc mới không*.
 */
export function RunningPanel({
  dangChay,
  slotDung,
  slotToiDa,
  hangDoi,
}: {
  dangChay: ViecDangChay[];
  slotDung: number;
  slotToiDa: number;
  hangDoi: number;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b bg-muted/30 px-5 py-3.5">
        <CardTitle className="text-base tracking-title">Machine is working</CardTitle>
        <CardDescription className="font-mono">
          {slotDung}/{slotToiDa} build slots · {hangDoi} queued
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col px-0">
        {dangChay.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>Machine is idle</EmptyTitle>
              <EmptyDescription>
                {hangDoi > 0
                  ? `${hangDoi} items waiting for the next tick.`
                  : "Nothing matched a rule on the last tick."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          dangChay.map((r) => (
            <div key={r.id} className="flex flex-col gap-1.5 border-b px-5 py-4 last:border-b-0">
              <div className="flex items-center gap-2">
                <StatusDot tone="agent" />
                <Link
                  href={`/t/${r.repo}/${r.number}`}
                  className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {r.repo}#{r.number}
                </Link>
                <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                  {khoangThoiGian(r.elapsed_s)}
                </span>
              </div>

              {r.title ? (
                <p className="text-sm font-medium tracking-title text-foreground">{r.title}</p>
              ) : null}

              <code className="text-xs text-muted-foreground">{r.rule}</code>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
