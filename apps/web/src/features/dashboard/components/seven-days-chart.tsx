"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

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

import type { NgayChay } from "../lib/seven-days";

/**
 * Màu đặc, không phải sắc nhạt: khối đỏ là tín hiệu duy nhất của biểu đồ này,
 * mà một sắc hồng 20% thì không ai thấy nó đang lớn dần.
 */
/*
 * Dùng `var(--link)` chứ KHÔNG phải `var(--color-link)`.
 *
 * `@theme inline` của Tailwind v4 không phát ra custom property — nó thay thế
 * lúc biên dịch. Nên `--color-link` tồn tại với Tailwind nhưng là `undefined`
 * lúc chạy, và Recharts nhận một `fill` không hợp lệ rồi vẽ ra... không gì cả.
 * Biểu đồ vẫn có trục, có chú giải, chỉ thiếu đúng phần dữ liệu — kiểu hỏng
 * không có lỗi nào báo.
 */
const CAU_HINH = {
  // Xanh nước biển, không phải xanh điện: `--link` (#0070f3) rực và kéo mắt
  // như một cái link bấm được. `--link-deep` (#0761d1) trầm hơn, để khối đỏ
  // giữ nguyên vai trò tín hiệu duy nhất của biểu đồ.
  xong: { label: "Chạy xong", color: "var(--link-deep)" },
  loi: { label: "Thất bại", color: "var(--destructive)" },
} satisfies ChartConfig;

/**
 * Chỉ số xu hướng **duy nhất** trên màn hình này: máy có đang tệ đi không.
 *
 * Cột chồng chứ không phải hai cột cạnh nhau — câu hỏi là "trong tổng số lần
 * chạy, bao nhiêu hỏng", và chiều cao cột trả lời luôn phần "tổng số".
 */
export function SevenDaysChart({ days, tomTat }: { days: NgayChay[]; tomTat: string | null }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b bg-muted/30 px-5 py-3.5">
        <CardTitle className="text-base tracking-title">Bảy ngày qua</CardTitle>
        {tomTat ? <CardDescription>{tomTat}</CardDescription> : null}
      </CardHeader>

      <CardContent className="px-5 py-5">
        <ChartContainer config={CAU_HINH} className="h-56 w-full">
          <BarChart accessibilityLayer data={days} maxBarSize={64}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="nhan" tickLine={false} axisLine={false} tickMargin={10} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="xong"
              stackId="a"
              fill="var(--color-xong)"
              radius={[0, 0, 4, 4]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="loi"
              stackId="a"
              fill="var(--color-loi)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
