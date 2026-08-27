"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { BeeGc } from "@/lib/bee/gc-fs";

import { runGcAction } from "../api/actions";

/** 1932735283 → "1.8 GB" — số byte thô không nói gì với người đọc. */
function reader(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${Math.round(bytes / 1_048_576)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Đĩa của phiên + nút dọn.
 *
 * Phần đáng giá không phải con số đã thu hồi mà là **lý do GIỮ**: gc cố ý bảo
 * thủ (chưa push, còn sửa chưa commit, phiên đang chạy…), nên đĩa còn đầy sau
 * khi dọn là chuyện bình thường — và người dùng phải đọc được vì sao ngay tại
 * đây, thay vì mở terminal ra đoán.
 */
export function DiskPanel({ gc }: { gc: BeeGc | null }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  function cleanup() {
    if (busy) return;
    start(async () => {
      const outcome = await runGcAction();
      setErr(outcome.ok ? "" : outcome.message);
      router.refresh();
    });
  }

  const held = gc?.items.filter((i) => i.action === "kept") ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-body">
          {gc === null ? (
            "gc chưa chạy lần nào — worktree của phiên đã xong đang chiếm đĩa."
          ) : (
            <>
              Lần dọn gần nhất: tmpDir hồi <b>{reader(gc.freed_bytes)}</b> từ{" "}
              <b>{gc.removed} worktree</b>.
            </>
          )}
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="outline" disabled={busy} onClick={cleanup}>
          {busy ? "Đang dọn…" : "Dọn ngay"}
        </Button>
      </div>

      {held.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-body">
            Giữ lại {held.length} worktree — vì sao
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {held.map((i) => (
              <li key={i.id} className="flex flex-wrap gap-2 font-mono text-xs">
                <span className="text-muted-foreground">{i.id.slice(0, 8)}</span>
                <span className="text-body">{i.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-muted-foreground">
        Chỉ tmpDir hồi worktree; <code>run.jsonl</code> và evidence (ảnh, video demo) nằm ở
        <code> sessions/</code> và không bao giờ bị đụng.
      </p>

      {err !== "" && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
