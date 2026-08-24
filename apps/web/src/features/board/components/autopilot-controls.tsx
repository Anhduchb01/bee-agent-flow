"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  boKhoiHangDoiAction,
  doiThuTuAction,
  themVaoHangDoiAction,
} from "../api/queue-actions";
import type { MucBang } from "../lib/lanes";

/**
 * Nút xếp/bỏ hàng và đổi thứ tự.
 *
 * Điện thoại KHÔNG kéo thả (D4): kéo một thẻ trong trang đang cuộn trên iPhone
 * là khổ hình, mà điện thoại mới là nơi việc được xếp trước lúc đi ngủ. Nên
 * mỗi thẻ có nút bấm được, và kéo thả chỉ là lối tắt thêm cho chuột.
 */

/** Vùng bấm ≥ 44px (sàn của Apple) — nút 24px với padding thì thumb vẫn trượt. */
const NUT = "flex size-9 items-center justify-center rounded-control border border-border text-xs text-body hover:bg-accent disabled:opacity-40";

export function NutXepHang({ muc }: { muc: MucBang }) {
  const router = useRouter();
  const [dang, batDau] = useTransition();
  const [loi, setLoi] = useState("");
  const daXep = muc.hangDoi !== null;

  function bam() {
    batDau(async () => {
      const ket = daXep
        ? await boKhoiHangDoiAction(muc.repo, muc.issue.number)
        : await themVaoHangDoiAction({
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
        aria-label={daXep ? `Bỏ #${muc.issue.number} khỏi Autopilot` : `Xếp #${muc.issue.number} vào Autopilot`}
        className={NUT}
      >
        {daXep ? "−" : "+"}
      </button>
      {loi !== "" && <span className="text-xs text-destructive">{loi}</span>}
    </>
  );
}

export function NutDoiThuTu({ muc }: { muc: MucBang }) {
  const router = useRouter();
  const [dang, batDau] = useTransition();
  if (muc.hangDoi === null) return null;

  const di = (buoc: -1 | 1) => () =>
    batDau(async () => {
      await doiThuTuAction(muc.repo, muc.issue.number, buoc);
      router.refresh();
    });

  return (
    <span className="flex gap-1">
      <button type="button" onClick={di(-1)} disabled={dang} aria-label={`Đưa #${muc.issue.number} lên trước`} className={NUT}>
        ↑
      </button>
      <button type="button" onClick={di(1)} disabled={dang} aria-label={`Đưa #${muc.issue.number} xuống sau`} className={NUT}>
        ↓
      </button>
    </span>
  );
}
