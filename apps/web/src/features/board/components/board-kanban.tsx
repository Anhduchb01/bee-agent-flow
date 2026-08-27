"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  dequeueAction,
  enqueueAction,
} from "../api/queue-actions";
import { LANES, isDropAllowed, LANE_HINT, LANE_LABEL, groupByLane, type Lane, type BoardRow } from "../lib/lanes";
import { ReorderButtons, QueueButton } from "./autopilot-controls";
import { LinkPR, AttachedSession, SoIssue } from "./issue-bits";

/**
 * Kanban view — the same four lanes as the lane rules, in lifecycle order.
 * The board scrolls sideways on a phone (one column ≈ one screen width,
 * snapped) instead of squeezing four unreadable columns onto 390px.
 */
export function BoardKanban({ row }: { row: BoardRow[] }) {
  const byLane = groupByLane(row);
  const router = useRouter();
  const [dragging, setKeo] = useState<BoardRow | null>(null);
  const [refused, setTuChoi] = useState("");
  const [, start] = useTransition();

  /**
   * Kéo thả CHỈ giữa Backlog ↔ Autopilot (D4). Ba lane kia là hệ quả của sự
   * thật — thả thẻ vào "In session" không làm phiên chạy — nên thả sai bị từ
   * chối kèm lý do, thay vì im lặng bật lại khiến người dùng tưởng tay mình run.
   */
  function dropInto(den: Lane) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const m = dragging;
      setKeo(null);
      if (m === null) return;
      const verify = isDropAllowed(m.lane, den);
      if (!verify.ok) {
        setTuChoi(verify.reason);
        return;
      }
      setTuChoi("");
      if (m.lane === den) return;
      start(async () => {
        if (den === "autopilot") {
          await enqueueAction({ slug: m.slug, repo: m.repo, issue: m.issue.number });
        } else {
          await dequeueAction(m.repo, m.issue.number);
        }
        router.refresh();
      });
    };
  }
  return (
    <div className="flex flex-col gap-2">
      {refused !== "" && (
        <p role="status" className="text-xs text-destructive">
          Cannot drop here: {refused}
        </p>
      )}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {LANES.map((lane) => (
        <section
          key={lane}
          aria-label={LANE_LABEL[lane]}
          onDragOver={(e) => e.preventDefault()}
          onDrop={dropInto(lane)}
          className="flex w-[85vw] shrink-0 snap-start flex-col gap-2 sm:w-72"
        >
          <header className="flex flex-col gap-0.5">
            <h2 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
              {LANE_LABEL[lane]}
              <span className="font-mono text-xs text-muted-foreground">
                {byLane[lane].length}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">{LANE_HINT[lane]}</p>
          </header>

          <ul className="flex flex-col gap-2">
            {byLane[lane].map((m) => (
              <li
                key={`${m.repo}#${m.issue.number}`}
                // Kéo thả là LỐI TẮT cho chuột. Điện thoại dùng nút +/↑↓ bên
                // dưới — kéo trong trang đang cuộn trên iPhone là khổ hình.
                draggable
                onDragStart={() => setKeo(m)}
                onDragEnd={() => setKeo(null)}
                className="flex flex-col gap-2 rounded-card border border-border bg-card p-3"
              >
                <span className="flex items-baseline gap-2">
                  <SoIssue row={m} />
                  <span className="min-w-0 text-sm text-foreground">{m.issue.title}</span>
                </span>
                <AttachedSession session={m.session} />
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-muted-foreground">{m.slug}</span>
                  <LinkPR row={m} />
                  <span className="flex-1" />
                  {lane === "autopilot" && <ReorderButtons row={m} />}
                  {(lane === "backlog" || lane === "autopilot") && <QueueButton row={m} />}
                </span>
                {m.queue?.reason != null && (
                  <span className="text-xs text-destructive">{m.queue.reason}</span>
                )}
              </li>
            ))}
            {byLane[lane].length === 0 && (
              <li className="rounded-card border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                Nothing here
              </li>
            )}
          </ul>
        </section>
      ))}
      </div>
    </div>
  );
}
