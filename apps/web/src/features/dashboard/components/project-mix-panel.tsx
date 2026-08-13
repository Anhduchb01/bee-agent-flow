"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/task-stage";

import type { HonHopDuAn } from "../lib/project-mix";

/*
 * Sáu màu rút từ bảng Vercel, và dùng biến gốc ở `:root` chứ không phải biến
 * của `@theme inline` — cái sau không tồn tại lúc chạy, Recharts sẽ nhận `fill`
 * rỗng và vẽ ra không gì cả.
 */
const CAU_HINH: ChartConfig = {
  nhap: { label: STAGE_LABEL.nhap, color: "#d4d4d4" },
  "cho-spec": { label: STAGE_LABEL["cho-spec"], color: "#8ec5ff" },
  "cho-giao": { label: STAGE_LABEL["cho-giao"], color: "var(--warning)" },
  "agent-lam": { label: STAGE_LABEL["agent-lam"], color: "var(--violet)" },
  "cho-duyet": { label: STAGE_LABEL["cho-duyet"], color: "var(--link)" },
  "can-nguoi": { label: STAGE_LABEL["can-nguoi"], color: "var(--destructive)" },
};

type Hang = { duAn: string; tong: number } & Partial<Record<Stage, number>>;

/**
 * Phân bố task theo giai đoạn, một thanh ngang cho mỗi dự án.
 *
 * Dùng **trục chung** chứ không phải mỗi thanh tự chuẩn hoá về 100%: thanh
 * 100% cho biết *tỉ lệ* nhưng giấu mất *khối lượng*, nên một dự án 2 task và
 * một dự án 20 task trông ngang nhau. Với trục chung, chiều dài thanh trả lời
 * "dự án nào đang gánh nhiều nhất" và các đoạn màu trả lời "gánh đang kẹt ở
 * đâu" — hai câu trong một hình.
 *
 * Thanh ngang chứ không phải cột dọc vì tên dự án đọc theo chiều ngang, và
 * danh sách dự án dài ra theo thời gian.
 */
export function ProjectMixPanel({ duAn }: { duAn: HonHopDuAn[] }) {
  const router = useRouter();
  const coTask = duAn.filter((d) => d.tong > 0);

  const data: Hang[] = coTask.map((d) => {
    const hang: Hang = { duAn: d.slug, tong: d.tong };
    for (const k of d.khuc) hang[k.stage] = k.so;
    return hang;
  });

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b bg-muted/30 px-5 py-3.5">
        <CardTitle className="text-base tracking-title">Projects</CardTitle>
        <CardDescription>
          Bar length is workload, colour is stage. Click to open a project.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-5 py-5">
        {data.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>No open tasks</EmptyTitle>
              <EmptyDescription>Create the first one from a project page.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ChartContainer
            config={CAU_HINH}
            className="w-full"
            style={{ height: `${Math.max(140, data.length * 56 + 56)}px` }}
          >
            <BarChart
              accessibilityLayer
              layout="vertical"
              data={data}
              margin={{ left: 4, right: 16 }}
              barSize={22}
              onClick={(e) => {
                // Recharts 3 không khai báo `activePayload` trong kiểu của
                // handler, nhưng vẫn truyền nó. Thu hẹp từ `unknown` thay vì
                // `as any` — nếu họ đổi hình dạng thì chỗ này trả về undefined
                // chứ không nổ.
                const payload = (e as { activePayload?: { payload?: Hang }[] }).activePayload;
                const slug = payload?.[0]?.payload?.duAn;
                if (slug) router.push(`/p/${slug}`);
              }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="duAn"
                tickLine={false}
                axisLine={false}
                width={92}
                tickMargin={8}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {STAGES.map((s, i) => (
                <Bar
                  key={s}
                  dataKey={s}
                  stackId="a"
                  fill={`var(--color-${s})`}
                  className="cursor-pointer"
                  isAnimationActive={false}
                  radius={
                    i === 0 ? [4, 0, 0, 4] : i === STAGES.length - 1 ? [0, 4, 4, 0] : undefined
                  }
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
