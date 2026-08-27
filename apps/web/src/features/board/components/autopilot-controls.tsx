"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  dequeueAction,
  runNowAction,
  reorderAction,
  enqueueAction,
} from "../api/queue-actions";
import type { BoardRow } from "../lib/lanes";

/**
 * Nút xếp/bỏ hàng và đổi thứ tự.
 *
 * Điện thoại KHÔNG kéo thả (D4): kéo một thẻ trong trang đang cuộn trên iPhone
 * là khổ hình, mà điện thoại mới là nơi việc được xếp trước lúc đi ngủ. Nên
 * mỗi thẻ có nút bấm được, và kéo thả chỉ là lối tắt thêm cho chuột.
 */

/** Vùng bấm ≥ 44px (sàn của Apple) — nút 24px với padding thì thumb vẫn trượt. */
const NUT = "flex size-9 items-center justify-center rounded-control border border-border text-xs text-body hover:bg-accent disabled:opacity-40";

export function QueueButton({ row }: { row: BoardRow }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState("");
  const queued = row.queue !== null;

  function onRunNow() {
    start(async () => {
      const outcome = queued
        ? await dequeueAction(row.repo, row.issue.number)
        : await enqueueAction({
            slug: row.slug,
            repo: row.repo,
            issue: row.issue.number,
          });
      setErr(outcome.ok ? "" : outcome.message);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onRunNow}
        disabled={busy}
        aria-label={queued ? `Remove #${row.issue.number} from Autopilot` : `Queue #${row.issue.number} for Autopilot`}
        className={NUT}
      >
        {queued ? "−" : "+"}
      </button>
      {err !== "" && <span className="text-xs text-destructive">{err}</span>}
    </>
  );
}

export function ReorderButtons({ row }: { row: BoardRow }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  if (row.queue === null) return null;

  const di = (step: -1 | 1) => () =>
    start(async () => {
      await reorderAction(row.repo, row.issue.number, step);
      router.refresh();
    });

  return (
    <span className="flex gap-1">
      <button type="button" onClick={di(-1)} disabled={busy} aria-label={`Move #${row.issue.number} earlier`} className={NUT}>
        ↑
      </button>
      <button type="button" onClick={di(1)} disabled={busy} aria-label={`Move #${row.issue.number} later`} className={NUT}>
        ↓
      </button>
    </span>
  );
}

/**
 * "Run now".
 *
 * Without it, the first question anyone has after queueing work is "did it
 * start, or am I waiting?" — and the correct answer (up to 30 minutes) is
 * written nowhere on screen. This button both cuts the wait to zero and
 * ANSWERS that question, through the reason it prints when it opens nothing.
 */
export function RunNowButton({ queued }: { queued: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [says, setSays] = useState("");

  function onRunNow() {
    start(async () => {
      const outcome = await runNowAction();
      setSays(outcome.message);
      router.refresh();
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRunNow}
        disabled={busy || queued === 0}
        className="flex h-9 items-center rounded-control border border-border px-3 text-xs text-body hover:bg-accent disabled:opacity-40"
      >
        {busy ? "Running…" : "Run now"}
      </button>
      {says !== "" && (
        <span role="status" className="text-xs text-muted-foreground">
          {says}
        </span>
      )}
    </span>
  );
}
