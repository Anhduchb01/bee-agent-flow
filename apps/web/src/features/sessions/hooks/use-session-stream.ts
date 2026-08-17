"use client";

import { useEffect, useState } from "react";

import { phanTichDong, type SuKien } from "../lib/parse-events";

export type TrangThaiKetNoi = "dang-noi" | "mo" | "mat-ket-noi" | "xong";

export interface LuongPhien {
  suKien: SuKien[];
  /** Chữ đang gõ dở của agent — từ text_delta, để màn hình chạy mượt. */
  dangGo: string;
  trangThai: TrangThaiKetNoi;
  /** Trạng thái cuối khi phiên đóng (done/stopped/failed) — null khi còn chạy. */
  ketThuc: string | null;
  /** Số sự kiện cũ đã bị bỏ qua khi gắn vào phiên chạy lâu (bee_replayed). */
  boQua: number;
}

/**
 * EventSource + gom sự kiện. Nối lại là việc của trình duyệt: chuẩn SSE tự
 * gửi `Last-Event-ID` (= offset byte do route đặt) khi reconnect, nên rớt
 * mạng điện thoại không mất khúc giữa mà không cần code gì thêm ở đây.
 * Mất kết nối KHÔNG xoá những gì đã hiện — chỉ đổi trạng thái dải báo.
 */
export function useSessionStream(id: string): LuongPhien {
  const [suKien, setSuKien] = useState<SuKien[]>([]);
  const [dangGo, setDangGo] = useState("");
  const [trangThai, setTrangThai] = useState<TrangThaiKetNoi>("dang-noi");
  const [ketThuc, setKetThuc] = useState<string | null>(null);
  const [boQua, setBoQua] = useState(0);

  useEffect(() => {
    const es = new EventSource(`/api/session/${id}/stream`);
    es.onopen = () => setTrangThai("mo");
    es.onerror = () => setTrangThai((t) => (t === "xong" ? t : "mat-ket-noi"));
    es.onmessage = (e: MessageEvent<string>) => {
      // bee_done là tín hiệu đóng của route, không phải sự kiện hiển thị.
      try {
        const raw = JSON.parse(e.data) as { type?: unknown; status?: unknown };
        if (raw.type === "bee_done") {
          setKetThuc(typeof raw.status === "string" ? raw.status : "done");
          setTrangThai("xong");
          es.close();
          return;
        }
      } catch {
        // không phải JSON — phanTichDong bên dưới xử lý như rác
      }

      const ket = phanTichDong(e.data);
      if (ket === null) return;
      for (const sk of ket) {
        if (sk.loai === "delta") {
          setDangGo((d) => d + sk.text);
        } else if (sk.loai === "agent-noi") {
          // Message trọn vẹn thay thế các delta đã gom — không hiện đúp.
          setDangGo("");
          setSuKien((s) => [...s, sk]);
        } else if (sk.loai === "replay") {
          setBoQua(sk.boQua);
        } else {
          setSuKien((s) => [...s, sk]);
        }
      }
    };
    return () => es.close();
  }, [id]);

  return { suKien, dangGo, trangThai, ketThuc, boQua };
}
