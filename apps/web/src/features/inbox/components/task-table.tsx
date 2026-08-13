"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { StatusDot, type Tone } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { daCho } from "@/lib/duration";
import { cn } from "@/lib/utils";

import { KIND_LABEL, type InboxItem, type InboxKind } from "../lib/derive";
import {
  BO_LOC_RONG,
  coLocGiKhong,
  duAnCoTrong,
  loaiCoTrong,
  locViec,
  NGUONG_CHO,
  type BoLoc,
} from "../lib/filter";
import { nhomTheoDuAn } from "../lib/group";

const TONE: Record<InboxKind, Tone> = {
  "can-nguoi": "down",
  "agent-hoi-nguoc": "agent",
  "duyet-pr": "ok",
  "duyet-spec": "ok",
  "cho-phep-nhan-task": "warn",
};

/** `<select>` thật, nên bàn phím và bàn phím ảo trên điện thoại hoạt động sẵn. */
function OChon({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-control border bg-background px-2 text-xs font-normal text-body"
    >
      {children}
    </select>
  );
}

export function TaskTable({ items }: { items: InboxItem[] }) {
  const [boLoc, setBoLoc] = useState<BoLoc>(BO_LOC_RONG);

  const duAn = useMemo(() => duAnCoTrong(items), [items]);
  const loai = useMemo(() => loaiCoTrong(items), [items]);
  const hien = useMemo(() => locViec(items, boLoc), [items, boLoc]);
  const nhom = useMemo(() => nhomTheoDuAn(hien), [hien]);
  const dangLoc = coLocGiKhong(boLoc);

  const dat = <K extends keyof BoLoc>(k: K, v: BoLoc[K]) => setBoLoc((b) => ({ ...b, [k]: v }));

  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden py-0">
        {/* Bảng có tên, và MỖI DỰ ÁN một <tbody> có tên: một <tbody> chung thì
            hàng đầu nhóm và hàng dữ liệu cùng là `row`, và không truy vấn nào
            phân biệt được chúng — cho cả trình đọc màn hình lẫn cho test. */}
        <Table aria-label="Việc đang chờ bạn">
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Loại</TableHead>
              <TableHead>Tiêu đề</TableHead>
              <TableHead className="w-36">Đã chờ</TableHead>
              <TableHead className="w-40 text-right">Hành động</TableHead>
            </TableRow>

            {/* Hàng lọc nằm ngay dưới tiêu đề: mỗi cột lọc bằng đúng thứ nó
                hiển thị, nên không phải nhớ bộ lọc nào ứng với cột nào. */}
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="py-2">
                <OChon
                  label="Lọc theo loại"
                  value={boLoc.loai}
                  onChange={(v) => dat("loai", v as BoLoc["loai"])}
                >
                  <option value="tat-ca">Mọi loại</option>
                  {loai.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </OChon>
              </TableHead>

              <TableHead className="py-2">
                <div className="flex items-center gap-3">
                  <Input
                    aria-label="Tìm trong tiêu đề"
                    placeholder="Tìm tiêu đề hoặc myapp#42 — gõ không dấu cũng được"
                    value={boLoc.tim}
                    onChange={(e) => dat("tim", e.target.value)}
                    className="h-8 text-xs font-normal"
                  />
                  <div className="w-36 shrink-0">
                    <OChon
                      label="Lọc theo dự án"
                      value={boLoc.duAn}
                      onChange={(v) => dat("duAn", v)}
                    >
                      <option value="tat-ca">Mọi dự án</option>
                      {duAn.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </OChon>
                  </div>
                </div>
              </TableHead>

              <TableHead className="py-2">
                <OChon
                  label="Lọc theo thời gian đã chờ"
                  value={String(boLoc.choLauHonS)}
                  onChange={(v) => dat("choLauHonS", Number(v))}
                >
                  {NGUONG_CHO.map((n) => (
                    <option key={n.value} value={n.value}>
                      {n.label}
                    </option>
                  ))}
                </OChon>
              </TableHead>

              <TableHead className="py-2">
                <label className="flex items-center justify-end gap-2 text-xs font-normal text-body">
                  <input
                    type="checkbox"
                    checked={boLoc.uuTien}
                    onChange={(e) => dat("uuTien", e.target.checked)}
                    className="size-4 rounded-control border-border accent-foreground"
                  />
                  Chỉ ưu tiên
                </label>
              </TableHead>
            </TableRow>
          </TableHeader>

          {hien.length === 0 ? (
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="p-0">
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyTitle>
                        {dangLoc ? "Không có việc nào khớp bộ lọc" : "Không có gì chờ bạn"}
                      </EmptyTitle>
                      <EmptyDescription>
                        {dangLoc
                          ? "Nới bộ lọc, hoặc bỏ lọc để xem lại đủ danh sách."
                          : "Mọi thứ đang ở phía máy. Bạn sẽ nhận thông báo khi có việc cần quyết."}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            nhom.map((g) => (
              <TableBody key={g.slug} aria-label={`Dự án ${g.slug}`}>
                {/* Đầu nhóm dính khi cuộn: đọc tới dòng thứ mười của một dự án
                    mà không còn thấy tên nó thì việc gộp coi như chưa làm. */}
                <TableRow className="sticky top-0 z-[1] bg-muted/60 backdrop-blur hover:bg-muted/60">
                  <TableCell colSpan={4} className="py-2">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/p/${g.slug}`}
                        className="font-mono text-xs font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {g.slug}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {g.items.length} việc · lâu nhất{" "}
                        {daCho(g.choLauNhatS).replace("đã chờ ", "")}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>

                {g.items.map((i) => (
                  <TableRow key={i.key}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <StatusDot tone={TONE[i.kind]} />
                        <span className="truncate text-xs text-body">{KIND_LABEL[i.kind]}</span>
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Link
                          href={`/t/${i.slug}/${i.number}`}
                          className="truncate font-medium tracking-title text-foreground underline-offset-4 hover:underline"
                        >
                          {i.title}
                        </Link>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {i.slug}#{i.number}
                        </span>
                        {i.priority ? (
                          <Badge variant="outline" className="shrink-0">
                            ưu tiên
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>

                    <TableCell className="font-mono text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                      <time dateTime={i.waitingSince}>{daCho(i.waitingS)}</time>
                    </TableCell>

                    <TableCell>
                      <span className="flex items-center justify-end gap-2">
                        {i.prUrl ? (
                          <a
                            href={i.prUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-link underline underline-offset-4"
                          >
                            #{i.prNumber}
                          </a>
                        ) : null}
                        <Link
                          href={`/t/${i.slug}/${i.number}`}
                          className={cn(
                            buttonVariants({
                              size: "sm",
                              variant: i.action.kind === "mo-task" ? "outline" : "default",
                            }),
                          )}
                        >
                          {i.action.label}
                        </Link>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            ))
          )}
        </Table>
      </Card>

      {dangLoc ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Hiện {hien.length}/{items.length} việc
          </span>
          <Button variant="ghost" size="sm" onClick={() => setBoLoc(BO_LOC_RONG)}>
            Bỏ lọc
          </Button>
        </div>
      ) : null}
    </div>
  );
}
