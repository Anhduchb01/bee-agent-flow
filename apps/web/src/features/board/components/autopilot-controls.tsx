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

export function QueueButton({ muc }: { muc: BoardRow }) {
  const router = useRouter();
  const [dang, start] = useTransition();
  const [loi, setLoi] = useState("");
  const queued = muc.queue !== null;

  function bam() {
    start(async () => {
      const ket = queued
        ? await dequeueAction(muc.repo, muc.issue.number)
        : await enqueueAction({
            slug: muc.slug,
            repo: muc.repo,
            issue: muc.issue.number,
          });
      setLoi(ket.ok ? "" : ket.message);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={bam}
        disabled={dang}
        aria-label={queued ? `Remove #${muc.issue.number} from Autopilot` : `Queue #${muc.issue.number} for Autopilot`}
        className={NUT}
      >
        {queued ? "−" : "+"}
      </button>
      {loi !== "" && <span className="text-xs text-destructive">{loi}</span>}
    </>
  );
}

export function ReorderButtons({ muc }: { muc: BoardRow }) {
  const router = useRouter();
  const [dang, start] = useTransition();
  if (muc.queue === null) return null;

  const di = (buoc: -1 | 1) => () =>
    start(async () => {
      await reorderAction(muc.repo, muc.issue.number, buoc);
      router.refresh();
    });

  return (
    <span className="flex gap-1">
      <button type="button" onClick={di(-1)} disabled={dang} aria-label={`Move #${muc.issue.number} earlier`} className={NUT}>
        ↑
      </button>
      <button type="button" onClick={di(1)} disabled={dang} aria-label={`Move #${muc.issue.number} later`} className={NUT}>
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
  const [dang, start] = useTransition();
  const [says, setSays] = useState("");

  function bam() {
    start(async () => {
      const ket = await runNowAction();
      setSays(ket.message);
      router.refresh();
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={bam}
        disabled={dang || queued === 0}
        className="flex h-9 items-center rounded-control border border-border px-3 text-xs text-body hover:bg-accent disabled:opacity-40"
      >
        {dang ? "Running…" : "Run now"}
      </button>
      {says !== "" && (
        <span role="status" className="text-xs text-muted-foreground">
          {says}
        </span>
      )}
    </span>
  );
}
