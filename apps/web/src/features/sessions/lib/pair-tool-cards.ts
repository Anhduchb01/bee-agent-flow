import type { StreamEvent } from "./parse-events";

/**
 * Sự kiện thô → mục hiển thị kiểu panel Claude Code trong VSCode: mỗi tool
 * call là MỘT thẻ có trạng thái (đang chạy → xong/lỗi, kết quả gập trong
 * thẻ), không phải hai dòng rời. Thuần, test được bằng fixture thật.
 *
 * Ghép cặp theo `tool_use id`; sự kiện cũ không có id (stream ghi trước bản
 * này) rơi về FIFO — kết quả vào thẻ đang-chạy cũ nhất.
 */

export type Card =
  | { kind: "lifecycle"; text: string }
  | { kind: "nguoi-noi"; text: string }
  | { kind: "agent-noi"; text: string }
  | { kind: "nghi"; text: string }
  | { kind: "artifact"; artifactKind: "issue" | "pr"; url: string; number: number | null; title: string | null }
  | { kind: "ket-qua"; err: boolean; turns: number | null }
  | { kind: "compact"; trigger: "manual" | "auto"; preTokens: number | null }
  | { kind: "da-cat"; skipped: number }
  /** Manual-mode approval card; answer được ghép từ bee_approval theo requestId. */
  | { kind: "xin-quyen"; requestId: string; name: string; args: string; answer: "allow" | "deny" | null }
  | {
      kind: "tool-card";
      name: string;
      id: string | null;
      file?: string;
      command?: string;
      cu?: string;
      latest?: string;
      args: string;
      status: "dang-chay" | "xong" | "loi";
      result: string | null;
    };

type TheTool = Extract<Card, { kind: "tool-card" }>;

export function pairToolCards(events: StreamEvent[]): Card[] {
  const row: Card[] = [];
  const waiting = new Map<string, TheTool>(); // id → thẻ chưa có kết quả
  const fifo: TheTool[] = []; // thẻ không id, theo thứ tự

  for (const sk of events) {
    switch (sk.kind) {
      case "tool": {
        const the: TheTool = {
          kind: "tool-card",
          name: sk.name,
          id: sk.id ?? null,
          ...(sk.file !== undefined ? { file: sk.file } : {}),
          ...(sk.command !== undefined ? { command: sk.command } : {}),
          ...(sk.cu !== undefined ? { cu: sk.cu } : {}),
          ...(sk.latest !== undefined ? { latest: sk.latest } : {}),
          args: sk.args,
          status: "dang-chay",
          result: null,
        };
        row.push(the);
        if (the.id) waiting.set(the.id, the);
        else fifo.push(the);
        break;
      }
      case "tool-xong": {
        // Mutate thẻ đã nằm trong `muc` — vị trí của thẻ là lúc tool BẮT ĐẦU,
        // đúng dòng thời gian người dùng đã thấy; chỉ trạng thái đổi.
        const the = (sk.id ? waiting.get(sk.id) : undefined) ?? fifo.shift();
        if (the) {
          the.status = sk.err === true ? "loi" : "xong";
          the.result = sk.text;
          if (the.id) waiting.delete(the.id);
        } else {
          // Kết quả mồ côi — tool_use nằm trong khúc bee_replayed đã cắt.
          // Vẫn phải hiện: mất kết quả tệ hơn mất tiêu đề.
          row.push({
            kind: "tool-card",
            name: "tool",
            id: sk.id ?? null,
            args: "",
            status: sk.err === true ? "loi" : "xong",
            result: sk.text,
          });
        }
        break;
      }
      case "lifecycle":
        row.push({ kind: "lifecycle", text: sk.text });
        break;
      case "nguoi-noi":
        row.push({ kind: "nguoi-noi", text: sk.text });
        break;
      case "agent-noi":
        row.push({ kind: "agent-noi", text: sk.text });
        break;
      case "nghi":
        row.push({ kind: "nghi", text: sk.text });
        break;
      case "artifact":
        row.push({ kind: "artifact", artifactKind: sk.artifactKind, url: sk.url, number: sk.number, title: sk.title });
        break;
      case "xin-quyen":
        row.push({
          kind: "xin-quyen",
          requestId: sk.requestId,
          name: sk.name,
          args: sk.args,
          answer: null,
        });
        break;
      case "quyen-da-tra-loi": {
        // Ghép ngược vào thẻ đã hỏi — thẻ đổi trạng thái, không thêm dòng mới.
        for (let i = row.length - 1; i >= 0; i -= 1) {
          const m = row[i]!;
          if (m.kind === "xin-quyen" && m.requestId === sk.requestId) {
            m.answer = sk.allow ? "allow" : "deny";
            break;
          }
        }
        break;
      }
      case "ket-qua":
        row.push({ kind: "ket-qua", err: sk.err, turns: sk.turns ?? null });
        break;
      case "compact":
        row.push({ kind: "compact", trigger: sk.trigger, preTokens: sk.preTokens });
        break;
      case "da-cat":
        row.push({ kind: "da-cat", skipped: sk.skipped });
        break;
      // delta/nghi-delta gom ở hook, replay hiện thành dải báo — không thành mục
      case "delta":
      case "nghi-delta":
      case "replay":
        break;
    }
  }
  return row;
}
