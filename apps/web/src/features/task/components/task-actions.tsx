"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { Actor, GhTask } from "@/lib/github/types";

import { duyetPR, duyetSpec, giaoChoAgent, type KetQua } from "../api/actions";

/**
 * Nút theo trạng thái. Mỗi nút là một thao tác ghi lên GitHub mang tên người
 * bấm — không có nút nào ở đây gọi tới máy agent, vì app không có đường nào tới
 * đó. Đổi state trên GitHub rồi để reconciler nhặt là toàn bộ cơ chế.
 *
 * **Không có nút merge.** Nếu một ngày ai đó thấy thiếu, câu trả lời là không:
 * merge cần người đọc diff, và chỗ đọc diff là GitHub.
 */
export function TaskActions({ task, actor }: { task: GhTask; actor: Actor }) {
  const router = useRouter();
  const [dangChay, startTransition] = useTransition();
  const [ketQua, setKetQua] = useState<KetQua | null>(null);

  const labels = new Set(task.labels);
  const daDuyet = task.pull?.reviews.some(
    (r) => r.author.login === actor.login && r.state === "APPROVED",
  );
  const testXanh = task.pull?.checks.some(
    (c) => c.name === "bee/test" && c.conclusion === "success",
  );

  function chay(fn: () => Promise<KetQua>) {
    setKetQua(null);
    startTransition(async () => {
      try {
        setKetQua(await fn());
        router.refresh();
      } catch (e) {
        setKetQua({ ok: false, message: e instanceof Error ? e.message : "Không làm được." });
      }
    });
  }

  const nut: { label: string; run: () => Promise<KetQua> }[] = [];

  if (labels.has("status:spec-review") && actor.role === "pm") {
    nut.push({ label: "Duyệt spec", run: () => duyetSpec(task.slug, task.number) });
  }
  if (labels.has("agent:build") && !labels.has("agent:eligible")) {
    nut.push({ label: "Giao cho agent", run: () => giaoChoAgent(task.slug, task.number) });
  }
  if (task.pull && !task.pull.draft && testXanh && !daDuyet) {
    nut.push({ label: "Duyệt PR", run: () => duyetPR(task.slug, task.number) });
  }

  if (nut.length === 0 && !ketQua) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {nut.map((n) => (
          <Button key={n.label} onClick={() => chay(n.run)} disabled={dangChay}>
            {n.label}
          </Button>
        ))}
      </div>
      {ketQua ? (
        <p
          aria-live="polite"
          className={ketQua.ok ? "text-sm text-body" : "text-sm text-destructive"}
        >
          {ketQua.message}
        </p>
      ) : null}
    </div>
  );
}
