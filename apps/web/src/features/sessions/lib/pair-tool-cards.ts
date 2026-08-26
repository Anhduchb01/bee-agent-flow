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
  | { loai: "lifecycle"; text: string }
  | { loai: "nguoi-noi"; text: string }
  | { loai: "agent-noi"; text: string }
  | { loai: "nghi"; text: string }
  | { loai: "artifact"; kind: "issue" | "pr"; url: string; number: number | null; title: string | null }
  | { loai: "ket-qua"; err: boolean; luot: number | null }
  | { loai: "compact"; trigger: "manual" | "auto"; preTokens: number | null }
  | { loai: "da-cat"; skipped: number }
  /** Manual-mode approval card; answer được ghép từ bee_approval theo requestId. */
  | { loai: "xin-quyen"; requestId: string; name: string; thamSo: string; answer: "allow" | "deny" | null }
  | {
      loai: "tool-card";
      name: string;
      id: string | null;
      file?: string;
      lenh?: string;
      cu?: string;
      latest?: string;
      thamSo: string;
      status: "dang-chay" | "xong" | "loi";
      result: string | null;
    };

type TheTool = Extract<Card, { loai: "tool-card" }>;

export function pairToolCards(events: StreamEvent[]): Card[] {
  const row: Card[] = [];
  const waiting = new Map<string, TheTool>(); // id → thẻ chưa có kết quả
  const fifo: TheTool[] = []; // thẻ không id, theo thứ tự

  for (const sk of events) {
    switch (sk.loai) {
      case "tool": {
        const the: TheTool = {
          loai: "tool-card",
          name: sk.name,
          id: sk.id ?? null,
          ...(sk.file !== undefined ? { file: sk.file } : {}),
          ...(sk.lenh !== undefined ? { lenh: sk.lenh } : {}),
          ...(sk.cu !== undefined ? { cu: sk.cu } : {}),
          ...(sk.latest !== undefined ? { latest: sk.latest } : {}),
          thamSo: sk.thamSo,
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
            loai: "tool-card",
            name: "tool",
            id: sk.id ?? null,
            thamSo: "",
            status: sk.err === true ? "loi" : "xong",
            result: sk.text,
          });
        }
        break;
      }
      case "lifecycle":
        row.push({ loai: "lifecycle", text: sk.text });
        break;
      case "nguoi-noi":
        row.push({ loai: "nguoi-noi", text: sk.text });
        break;
      case "agent-noi":
        row.push({ loai: "agent-noi", text: sk.text });
        break;
      case "nghi":
        row.push({ loai: "nghi", text: sk.text });
        break;
      case "artifact":
        row.push({ loai: "artifact", kind: sk.kind, url: sk.url, number: sk.number, title: sk.title });
        break;
      case "xin-quyen":
        row.push({
          loai: "xin-quyen",
          requestId: sk.requestId,
          name: sk.name,
          thamSo: sk.thamSo,
          answer: null,
        });
        break;
      case "quyen-da-tra-loi": {
        // Ghép ngược vào thẻ đã hỏi — thẻ đổi trạng thái, không thêm dòng mới.
        for (let i = row.length - 1; i >= 0; i -= 1) {
          const m = row[i]!;
          if (m.loai === "xin-quyen" && m.requestId === sk.requestId) {
            m.answer = sk.allow ? "allow" : "deny";
            break;
          }
        }
        break;
      }
      case "ket-qua":
        row.push({ loai: "ket-qua", err: sk.err, luot: sk.luot ?? null });
        break;
      case "compact":
        row.push({ loai: "compact", trigger: sk.trigger, preTokens: sk.preTokens });
        break;
      case "da-cat":
        row.push({ loai: "da-cat", skipped: sk.skipped });
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
