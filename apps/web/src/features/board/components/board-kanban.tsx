"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  boKhoiHangDoiAction,
  themVaoHangDoiAction,
} from "../api/queue-actions";
import { CAC_LANE, laThaHopLe, MOTA_LANE, NHAN_LANE, nhomTheoLane, type Lane, type MucBang } from "../lib/lanes";
import { NutDoiThuTu, NutXepHang } from "./autopilot-controls";
import { LinkPR, PhienGan, SoIssue } from "./issue-bits";

/**
 * Kanban view — the same four lanes as the lane rules, in lifecycle order.
 * The board scrolls sideways on a phone (one column ≈ one screen width,
 * snapped) instead of squeezing four unreadable columns onto 390px.
 */
export function BoardKanban({ muc }: { muc: MucBang[] }) {
  const theoLane = nhomTheoLane(muc);
  const router = useRouter();
  const [keo, setKeo] = useState<MucBang | null>(null);
  const [tuChoi, setTuChoi] = useState("");
  const [, batDau] = useTransition();

  /**
   * Kéo thả CHỈ giữa Backlog ↔ Autopilot (D4). Ba lane kia là hệ quả của sự
   * thật — thả thẻ vào "In session" không làm phiên chạy — nên thả sai bị từ
   * chối kèm lý do, thay vì im lặng bật lại khiến người dùng tưởng tay mình run.
   */
  function tha(den: Lane) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const m = keo;
      setKeo(null);
      if (m === null) return;
      const kiem = laThaHopLe(m.lane, den);
      if (!kiem.ok) {
        setTuChoi(kiem.lyDo);
        return;
      }
      setTuChoi("");
      if (m.lane === den) return;
      batDau(async () => {
        if (den === "autopilot") {
          await themVaoHangDoiAction({ slug: m.slug, repo: m.repo, issue: m.issue.number });
        } else {
          await boKhoiHangDoiAction(m.repo, m.issue.number);
        }
        router.refresh();
      });
    };
  }
  return (
    <div className="flex flex-col gap-2">
      {tuChoi !== "" && (
        <p role="status" className="text-xs text-destructive">
          Không thả được: {tuChoi}
        </p>
      )}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {CAC_LANE.map((lane) => (
        <section
          key={lane}
          aria-label={NHAN_LANE[lane]}
          onDragOver={(e) => e.preventDefault()}
          onDrop={tha(lane)}
          className="flex w-[85vw] shrink-0 snap-start flex-col gap-2 sm:w-72"
        >
          <header className="flex flex-col gap-0.5">
            <h2 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
              {NHAN_LANE[lane]}
              <span className="font-mono text-xs text-muted-foreground">
                {theoLane[lane].length}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">{MOTA_LANE[lane]}</p>
          </header>

          <ul className="flex flex-col gap-2">
            {theoLane[lane].map((m) => (
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
                  <SoIssue muc={m} />
                  <span className="min-w-0 text-sm text-foreground">{m.issue.title}</span>
                </span>
                <PhienGan phien={m.phien} />
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-muted-foreground">{m.slug}</span>
                  <LinkPR muc={m} />
                  <span className="flex-1" />
                  {lane === "autopilot" && <NutDoiThuTu muc={m} />}
                  {(lane === "backlog" || lane === "autopilot") && <NutXepHang muc={m} />}
                </span>
                {m.hangDoi?.reason != null && (
                  <span className="text-xs text-destructive">{m.hangDoi.reason}</span>
                )}
              </li>
            ))}
            {theoLane[lane].length === 0 && (
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
