"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { parseLine, type StreamEvent } from "../lib/parse-events";

export type ConnectionState = "connecting" | "open" | "disconnected" | "done";

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
  /**
   * How many lines are still ABOVE what is loaded, and a way to ask for the
   * next page of them. `0` means the chat is scrolled back to its first line.
   */
  above: number;
  loadOlder: () => Promise<void>;
  loadingOlder: boolean;
}

/** One page of history. Small enough that a phone paints between pages. */
const PAGE = 200;

/**
 * EventSource + gom sự kiện. Nối lại là việc của trình duyệt: chuẩn SSE tự
 * gửi `Last-Event-ID` (= offset byte do route đặt) khi reconnect, nên rớt
 * mạng điện thoại không mất khúc giữa mà không cần code gì thêm ở đây.
 * Mất kết nối KHÔNG xoá những gì đã hiện — chỉ đổi trạng thái dải báo.
 */
export function useSessionStream(id: string): SessionStream {
  const [events, setSuKien] = useState<StreamEvent[]>([]);
  const [typing, setTyping] = useState("");
  const [idle, setIdle] = useState("");
  const [status, setState] = useState<ConnectionState>("connecting");
  const [ended, setEnded] = useState<string | null>(null);
  const [skipped, setBoQua] = useState(0);
  /** Older lines, oldest first, fetched by loadOlder and shown above `events`. */
  const [older, setOlder] = useState<StreamEvent[]>([]);
  /** Lines above what is loaded. Seeded by bee_replayed, walked down by paging. */
  const [above, setAbove] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Guards against a scroll handler firing twice for the same page. */
  const fetching = useRef(false);

  // A new session id is a different conversation: drop what was paged in, or
  // the top of the chat would show someone else's history.
  //
  // Adjusted during render, react.dev's "adjusting state when a prop changes":
  // an effect would paint the previous session's history for one frame first,
  // and it is state rather than a ref because refs must not be read here.
  const [seenId, setSeenId] = useState(id);
  if (seenId !== id) {
    setSeenId(id);
    setOlder([]);
    setAbove(0);
    setBoQua(0);
  }

  useEffect(() => {
    const es = new EventSource(`/api/session/${id}/stream`);
    es.onopen = () => setState("open");
    es.onerror = () => setState((t) => (t === "done" ? t : "disconnected"));
    es.onmessage = (e: MessageEvent<string>) => {
      // bee_done là tín hiệu đóng của route, không phải sự kiện hiển thị.
      try {
        const raw = JSON.parse(e.data) as { type?: unknown; status?: unknown };
        if (raw.type === "bee_done") {
          setEnded(typeof raw.status === "string" ? raw.status : "done");
          setState("done");
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
          setTyping((d) => d + sk.text);
        } else if (sk.kind === "thinking-delta") {
          setIdle((d) => d + sk.text);
        } else if (sk.kind === "agent-said" || sk.kind === "thinking") {
          // Message trọn vẹn thay thế các delta đã gom — không hiện đúp.
          setTyping("");
          setIdle("");
          setSuKien((s) => [...s, sk]);
        } else if (sk.kind === "replay") {
          setBoQua(sk.skipped);
          setAbove(sk.skipped);
        } else {
          setSuKien((s) => [...s, sk]);
        }
      }
    };
    return () => es.close();
  }, [id]);


  const loadOlder = useCallback(async () => {
    if (fetching.current || above <= 0) return;
    fetching.current = true;
    setLoadingOlder(true);
    try {
      const from = Math.max(0, above - PAGE);
      const limit = above - from;
      const res = await fetch(`/api/session/${id}/history?from=${from}&limit=${limit}`);
      if (!res.ok) return;
      const body = (await res.json()) as { lines?: unknown };
      const lines = Array.isArray(body.lines) ? body.lines : [];
      const page: StreamEvent[] = [];
      for (const raw of lines) {
        if (typeof raw !== "string") continue;
        const outcome = parseLine(raw);
        // Deltas are re-assembled noise once the full message is on the line
        // after them; replaying them into history would double every reply.
        if (outcome !== null) {
          page.push(...outcome.filter((k) => k.kind !== "delta" && k.kind !== "thinking-delta"));
        }
      }
      setOlder((prev) => [...page, ...prev]);
      setAbove(from);
    } catch {
      // Offline or a refused page: leave `above` alone so the reader can retry
      // by scrolling up again.
    } finally {
      setLoadingOlder(false);
      fetching.current = false;
    }
  }, [id, above]);

  return {
    events: older.length === 0 ? events : [...older, ...events],
    typing,
    idle,
    status,
    ended,
    skipped,
    above,
    loadOlder,
    loadingOlder,
  };
}
