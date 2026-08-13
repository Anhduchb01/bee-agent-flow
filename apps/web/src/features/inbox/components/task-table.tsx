"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { StatusDot, type Tone } from "@/components/status-dot";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const TONE: Record<InboxKind, Tone> = {
  "can-nguoi": "down",
  "agent-hoi-nguoc": "agent",
  "duyet-pr": "ok",
  "duyet-spec": "ok",
  "cho-phep-nhan-task": "warn",
};

/** Ô chọn trong hàng lọc: `<select>` thật, nên bàn phím và mobile hoạt động sẵn. */
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
      className="h-7 w-full rounded-control border border-border bg-card px-2 text-xs text-body"
    >
      {children}
    </select>
  );
}

const COT = "grid grid-cols-[9rem_7rem_1fr_7rem_8rem] items-center gap-3 px-5";

export function TaskTable({ items }: { items: InboxItem[] }) {
  const [boLoc, setBoLoc] = useState<BoLoc>(BO_LOC_RONG);

  const duAn = useMemo(() => duAnCoTrong(items), [items]);
  const loai = useMemo(() => loaiCoTrong(items), [items]);
  const hien = useMemo(() => locViec(items, boLoc), [items, boLoc]);
  const dangLoc = coLocGiKhong(boLoc);

  const dat = <K extends keyof BoLoc>(k: K, v: BoLoc[K]) => setBoLoc((b) => ({ ...b, [k]: v }));

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div className="min-w-[52rem] overflow-hidden rounded-card border border-border bg-card">
          {/* Tiêu đề cột */}
          <div className={cn(COT, "border-b border-border py-2.5")} role="row">
            <span className="eyebrow">Loại</span>
            <span className="eyebrow">Dự án</span>
            <span className="eyebrow">Tiêu đề</span>
            <span className="eyebrow">Đã chờ</span>
            <span className="eyebrow text-right">Hành động</span>
          </div>

          {/* Hàng lọc — mỗi cột lọc bằng đúng thứ nó hiển thị */}
          <div className={cn(COT, "border-b border-border bg-muted/40 py-2")}>
            <OChon label="Lọc theo loại" value={boLoc.loai} onChange={(v) => dat("loai", v as BoLoc["loai"])}>
              <option value="tat-ca">Tất cả</option>
              {loai.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </OChon>

            <OChon label="Lọc theo dự án" value={boLoc.duAn} onChange={(v) => dat("duAn", v)}>
              <option value="tat-ca">Tất cả</option>
              {duAn.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </OChon>

            <Input
              aria-label="Tìm trong tiêu đề"
              placeholder="Tìm tiêu đề hoặc myapp#42 — gõ không dấu cũng được"
              value={boLoc.tim}
              onChange={(e) => dat("tim", e.target.value)}
              className="h-7 text-xs"
            />

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

            <label className="flex items-center justify-end gap-1.5 text-xs text-body">
              <input
                type="checkbox"
                checked={boLoc.uuTien}
                onChange={(e) => dat("uuTien", e.target.checked)}
                className="size-3.5 rounded-control border-border accent-foreground"
              />
              Chỉ ưu tiên
            </label>
          </div>

          {/* Hàng dữ liệu */}
          {hien.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-body">
              {dangLoc
                ? "Không có việc nào khớp bộ lọc."
                : "Không có gì chờ bạn. Mọi thứ đang ở phía máy."}
            </p>
          ) : (
            <ul aria-label="Việc đang chờ bạn">
              {hien.map((i) => (
                <li key={i.key} className={cn(COT, "border-b border-border py-3 last:border-b-0")}>
                  <span className="flex items-center gap-1.5">
                    <StatusDot tone={TONE[i.kind]} />
                    <span className="eyebrow truncate">{KIND_LABEL[i.kind]}</span>
                  </span>

                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {i.slug}#{i.number}
                  </span>

                  <span className="flex min-w-0 items-center gap-2">
                    <Link
                      href={`/t/${i.slug}/${i.number}`}
                      className="truncate text-sm font-medium tracking-title text-foreground underline-offset-4 hover:underline"
                    >
                      {i.title}
                    </Link>
                    {i.priority ? (
                      <span className="eyebrow shrink-0 rounded-pill border border-border px-1.5">
                        ưu tiên
                      </span>
                    ) : null}
                  </span>

                  <time
                    dateTime={i.waitingSince}
                    className="font-mono text-xs tabular-nums text-muted-foreground"
                  >
                    {daCho(i.waitingS)}
                  </time>

                  <span className="flex items-center justify-end gap-1.5">
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
