import "server-only";

import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";
import { isSessionId } from "@/lib/bee/session-id";
import { readMore } from "@/lib/bee/tail";

/**
 * SSE tail của `run.jsonl` — đường ra của một phiên live.
 *
 * `id:` của mỗi frame là offset byte SAU dòng đó. Trình duyệt tự gửi
 * `Last-Event-ID` khi reconnect (chuẩn SSE), nên mạng điện thoại rớt không
 * mất khúc giữa mà không cần code phía client.
 *
 * Gắn lần đầu vào phiên đã chạy lâu: chỉ phát N dòng cuối kèm một sự kiện
 * `bee_replayed` nói rõ đã bỏ qua bao nhiêu — không im lặng cắt (spec §4.2).
 */

const NHIP_MS = 250;
const KIEM_META_MOI = 8; // 8 nhịp ≈ 2s một lần đọc meta — đủ nhạy, đủ rẻ
const REPLAY_TOI_DA = 200;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("forbidden", { status: 401 });

  const { id } = await params;
  if (!isSessionId(id)) return new Response("bad id", { status: 400 });

  const nguon = getBee();
  const file = nguon.sessionRunPath(id);
  if (!file) return new Response("no such session", { status: 404 });

  const tuOffset = Number(req.headers.get("last-event-id") ?? "0");
  const encoder = new TextEncoder();

  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let offset = Number.isFinite(tuOffset) && tuOffset > 0 ? tuOffset : 0;
      let rest = "";
      let nhip = 0;

      const phat = (line: string, tai: number) => {
        controller.enqueue(encoder.encode(`id: ${tai}\ndata: ${line}\n\n`));
      };

      // Lần gắn đầu (offset 0): replay có kiểm soát.
      if (offset === 0) {
        const dau = await readMore(file, 0, "");
        const line = dau.line;
        if (line.length > REPLAY_TOI_DA) {
          phat(JSON.stringify({ type: "bee_replayed", skipped: line.length - REPLAY_TOI_DA }), 0);
        }
        for (const d of line.slice(-REPLAY_TOI_DA)) phat(d, dau.offset);
        offset = dau.offset;
        rest = dau.rest;
      }

      const line = () => {
        if (timer) clearInterval(timer);
        timer = null;
        try {
          controller.close();
        } catch {
          // client đã đóng trước — không sao
        }
      };

      timer = setInterval(() => {
        void (async () => {
          const moi = await readMore(file, offset, rest);
          for (const d of moi.line) phat(d, moi.offset);
          offset = moi.offset;
          rest = moi.rest;

          nhip += 1;
          if (nhip % KIEM_META_MOI === 0) {
            const phien = await nguon.readSession(id);
            // Phiên hết running → phát nốt phần còn lại rồi ĐÓNG. Không để
            // một EventSource treo vĩnh viễn trên một phiên đã xong.
            if (phien && phien.status !== "running" && phien.status !== "starting") {
              const cuoi = await readMore(file, offset, rest);
              for (const d of cuoi.line) phat(d, cuoi.offset);
              phat(JSON.stringify({ type: "bee_done", status: phien.status }), cuoi.offset);
              line();
            }
          }
        })();
      }, NHIP_MS);
    },
    cancel() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
