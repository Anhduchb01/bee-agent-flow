import type { SuKien } from "./parse-events";

/**
 * Sự kiện thô → mục hiển thị kiểu panel Claude Code trong VSCode: mỗi tool
 * call là MỘT thẻ có trạng thái (đang chạy → xong/lỗi, kết quả gập trong
 * thẻ), không phải hai dòng rời. Thuần, test được bằng fixture thật.
 *
 * Ghép cặp theo `tool_use id`; sự kiện cũ không có id (stream ghi trước bản
 * này) rơi về FIFO — kết quả vào thẻ đang-chạy cũ nhất.
 */

export type Muc =
  | { loai: "lifecycle"; text: string }
  | { loai: "nguoi-noi"; text: string }
  | { loai: "agent-noi"; text: string }
  | { loai: "nghi"; text: string }
  | { loai: "artifact"; kind: "issue" | "pr"; url: string; number: number | null }
  | { loai: "ket-qua"; loi: boolean; luot: number | null }
  | {
      loai: "tool-card";
      ten: string;
      id: string | null;
      file?: string;
      lenh?: string;
      thamSo: string;
      trangThai: "dang-chay" | "xong" | "loi";
      ketQua: string | null;
    };

type TheTool = Extract<Muc, { loai: "tool-card" }>;

export function ghepThe(suKien: SuKien[]): Muc[] {
  const muc: Muc[] = [];
  const dangCho = new Map<string, TheTool>(); // id → thẻ chưa có kết quả
  const fifo: TheTool[] = []; // thẻ không id, theo thứ tự

  for (const sk of suKien) {
    switch (sk.loai) {
      case "tool": {
        const the: TheTool = {
          loai: "tool-card",
          ten: sk.ten,
          id: sk.id ?? null,
          ...(sk.file !== undefined ? { file: sk.file } : {}),
          ...(sk.lenh !== undefined ? { lenh: sk.lenh } : {}),
          thamSo: sk.thamSo,
          trangThai: "dang-chay",
          ketQua: null,
        };
        muc.push(the);
        if (the.id) dangCho.set(the.id, the);
        else fifo.push(the);
        break;
      }
      case "tool-xong": {
        // Mutate thẻ đã nằm trong `muc` — vị trí của thẻ là lúc tool BẮT ĐẦU,
        // đúng dòng thời gian người dùng đã thấy; chỉ trạng thái đổi.
        const the = (sk.id ? dangCho.get(sk.id) : undefined) ?? fifo.shift();
        if (the) {
          the.trangThai = sk.loi === true ? "loi" : "xong";
          the.ketQua = sk.text;
          if (the.id) dangCho.delete(the.id);
        } else {
          // Kết quả mồ côi — tool_use nằm trong khúc bee_replayed đã cắt.
          // Vẫn phải hiện: mất kết quả tệ hơn mất tiêu đề.
          muc.push({
            loai: "tool-card",
            ten: "tool",
            id: sk.id ?? null,
            thamSo: "",
            trangThai: sk.loi === true ? "loi" : "xong",
            ketQua: sk.text,
          });
        }
        break;
      }
      case "lifecycle":
        muc.push({ loai: "lifecycle", text: sk.text });
        break;
      case "nguoi-noi":
        muc.push({ loai: "nguoi-noi", text: sk.text });
        break;
      case "agent-noi":
        muc.push({ loai: "agent-noi", text: sk.text });
        break;
      case "nghi":
        muc.push({ loai: "nghi", text: sk.text });
        break;
      case "artifact":
        muc.push({ loai: "artifact", kind: sk.kind, url: sk.url, number: sk.number });
        break;
      case "ket-qua":
        muc.push({ loai: "ket-qua", loi: sk.loi, luot: sk.luot ?? null });
        break;
      // delta/nghi-delta gom ở hook, replay hiện thành dải báo — không thành mục
      case "delta":
      case "nghi-delta":
      case "replay":
        break;
    }
  }
  return muc;
}
