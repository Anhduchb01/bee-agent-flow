"use client";

import { useEffect, useState } from "react";

import { parseLine, type StreamEvent } from "../lib/parse-events";

export type ConnectionState = "dang-noi" | "mo" | "mat-ket-noi" | "xong";

export interface SessionStream {
  events: StreamEvent[];
  /** Chữ đang gõ dở của agent — từ text_delta, để màn hình chạy mượt. */
  typing: string;
  /** Thinking đang chảy — buffer riêng, khối trọn vẹn trong message thay thế. */
  idle: string;
  status: ConnectionState;
  /** Trạng thái cuối khi phiên đóng (done/stopped/failed) — null khi còn chạy. */
  ended: string | null;
  /** Số sự kiện cũ đã bị bỏ qua khi gắn vào phiên chạy lâu (bee_replayed). */
  skipped: number;
}

/**
 * EventSource + gom sự kiện. Nối lại là việc của trình duyệt: chuẩn SSE tự
 * gửi `Last-Event-ID` (= offset byte do route đặt) khi reconnect, nên rớt
 * mạng điện thoại không mất khúc giữa mà không cần code gì thêm ở đây.
 * Mất kết nối KHÔNG xoá những gì đã hiện — chỉ đổi trạng thái dải báo.
 */
export function useSessionStream(id: string): SessionStream {
  const [events, setSuKien] = useState<StreamEvent[]>([]);
  const [typing, setDangGo] = useState("");
  const [idle, setDangNghi] = useState("");
  const [status, setTrangThai] = useState<ConnectionState>("dang-noi");
  const [ended, setKetThuc] = useState<string | null>(null);
  const [skipped, setBoQua] = useState(0);

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
        // không phải JSON — parseLine bên dưới xử lý như rác
      }

      const outcome = parseLine(e.data);
      if (outcome === null) return;
      for (const sk of outcome) {
        if (sk.kind === "delta") {
          setDangGo((d) => d + sk.text);
        } else if (sk.kind === "nghi-delta") {
          setDangNghi((d) => d + sk.text);
        } else if (sk.kind === "agent-noi" || sk.kind === "nghi") {
          // Message trọn vẹn thay thế các delta đã gom — không hiện đúp.
          setDangGo("");
          setDangNghi("");
          setSuKien((s) => [...s, sk]);
        } else if (sk.kind === "replay") {
          setBoQua(sk.skipped);
        } else {
          setSuKien((s) => [...s, sk]);
        }
      }
    };
    return () => es.close();
  }, [id]);

  return { events, typing, idle, status, ended, skipped };
}
