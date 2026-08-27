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
  | { kind: "user-said"; text: string }
  | { kind: "agent-said"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "artifact"; artifactKind: "issue" | "pr"; url: string; number: number | null; title: string | null }
  | { kind: "result"; err: boolean; turns: number | null }
  | { kind: "compact"; trigger: "manual" | "auto"; preTokens: number | null }
  | { kind: "truncated"; skipped: number }
  /** Manual-mode approval card; answer được ghép từ bee_approval theo requestId. */
  | { kind: "permission-asked"; requestId: string; name: string; args: string; answer: "allow" | "deny" | null }
  | {
      kind: "tool-card";
      name: string;
      id: string | null;
      file?: string;
      command?: string;
      cu?: string;
      latest?: string;
      args: string;
      status: "running" | "done" | "error";
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
        const card: TheTool = {
          kind: "tool-card",
          name: sk.name,
          id: sk.id ?? null,
          ...(sk.file !== undefined ? { file: sk.file } : {}),
          ...(sk.command !== undefined ? { command: sk.command } : {}),
          ...(sk.cu !== undefined ? { cu: sk.cu } : {}),
          ...(sk.latest !== undefined ? { latest: sk.latest } : {}),
          args: sk.args,
          status: "running",
          result: null,
        };
        row.push(card);
        if (card.id) waiting.set(card.id, card);
        else fifo.push(card);
        break;
      }
      case "tool-done": {
        // Mutate thẻ đã nằm trong `muc` — vị trí của thẻ là lúc tool BẮT ĐẦU,
        // đúng dòng thời gian người dùng đã thấy; chỉ trạng thái đổi.
        const card = (sk.id ? waiting.get(sk.id) : undefined) ?? fifo.shift();
        if (card) {
          card.status = sk.err === true ? "error" : "done";
          card.result = sk.text;
          if (card.id) waiting.delete(card.id);
        } else {
          // Kết quả mồ côi — tool_use nằm trong khúc bee_replayed đã cắt.
          // Vẫn phải hiện: mất kết quả tệ hơn mất tiêu đề.
          row.push({
            kind: "tool-card",
            name: "tool",
            id: sk.id ?? null,
            args: "",
            status: sk.err === true ? "error" : "done",
            result: sk.text,
          });
        }
        break;
      }
      case "lifecycle":
        row.push({ kind: "lifecycle", text: sk.text });
        break;
      case "user-said":
        row.push({ kind: "user-said", text: sk.text });
        break;
      case "agent-said":
        row.push({ kind: "agent-said", text: sk.text });
        break;
      case "thinking":
        row.push({ kind: "thinking", text: sk.text });
        break;
      case "artifact":
        row.push({ kind: "artifact", artifactKind: sk.artifactKind, url: sk.url, number: sk.number, title: sk.title });
        break;
      case "permission-asked":
        row.push({
          kind: "permission-asked",
          requestId: sk.requestId,
          name: sk.name,
          args: sk.args,
          answer: null,
        });
        break;
      case "permission-answered": {
        // Ghép ngược vào thẻ đã hỏi — thẻ đổi trạng thái, không thêm dòng mới.
        for (let i = row.length - 1; i >= 0; i -= 1) {
          const m = row[i]!;
          if (m.kind === "permission-asked" && m.requestId === sk.requestId) {
            m.answer = sk.allow ? "allow" : "deny";
            break;
          }
        }
        break;
      }
      case "result":
        row.push({ kind: "result", err: sk.err, turns: sk.turns ?? null });
        break;
      case "compact":
        row.push({ kind: "compact", trigger: sk.trigger, preTokens: sk.preTokens });
        break;
      case "truncated":
        row.push({ kind: "truncated", skipped: sk.skipped });
        break;
      // delta/nghi-delta gom ở hook, replay hiện thành dải báo — không thành mục
      case "delta":
      case "thinking-delta":
      case "replay":
        break;
    }
  }
  return row;
}
