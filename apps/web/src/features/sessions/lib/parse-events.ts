/**
 * stream-json thô → sự kiện hiển thị được. Thuần, không I/O — chỗ dễ sai nhất
 * của cả slice (hình dạng stream đổi theo phiên bản CLI) nên phải test được
 * bằng fixture thật mà không cần máy chạy.
 *
 * Nguyên tắc: WHITELIST loại mình hiểu, bỏ qua êm phần còn lại. Stream thật
 * chứa nhiều loại ngoài tài liệu (hook_started, thinking_tokens,
 * rate_limit_event…) — coi chúng là rác thì mỗi lần CLI thêm loại mới là một
 * lần cảnh báo giả; coi chúng là lỗi thì UI chết theo. Chỉ dòng không phải
 * JSON mới là rác thật.
 */

export type SuKien =
  | { loai: "lifecycle"; text: string; ts?: string }
  | { loai: "nguoi-noi"; text: string; ts?: string }
  | { loai: "agent-noi"; text: string }
  | { loai: "delta"; text: string }
  | { loai: "tool"; ten: string; thamSo: string }
  | { loai: "tool-xong"; text: string }
  | { loai: "ket-qua"; loi: boolean }
  | { loai: "replay"; boQua: number }
  | { loai: "artifact"; kind: "issue" | "pr"; url: string; number: number | null };

const CAT_THAM_SO = 160;
const CAT_KET_QUA = 400;

function laObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function cat(text: string, tran: number): string {
  return text.length > tran ? `${text.slice(0, tran)}…` : text;
}

/** Nội dung tool_result có thể là chuỗi hoặc mảng block — quy hết về chuỗi. */
function textCuaToolResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (laObject(c) && typeof c.text === "string" ? c.text : ""))
      .join("");
  }
  return "";
}

function tuContentBlocks(content: unknown, nguon: "assistant" | "user"): SuKien[] {
  if (!Array.isArray(content)) return [];
  const ra: SuKien[] = [];
  for (const block of content) {
    if (!laObject(block)) continue;
    if (nguon === "assistant" && block.type === "text" && typeof block.text === "string") {
      if (block.text.trim() !== "") ra.push({ loai: "agent-noi", text: block.text });
    }
    if (nguon === "assistant" && block.type === "tool_use") {
      ra.push({
        loai: "tool",
        ten: typeof block.name === "string" ? block.name : "?",
        thamSo: cat(JSON.stringify(block.input ?? {}), CAT_THAM_SO),
      });
    }
    if (nguon === "user" && block.type === "tool_result") {
      ra.push({ loai: "tool-xong", text: cat(textCuaToolResult(block.content), CAT_KET_QUA) });
    }
  }
  return ra;
}

/**
 * Một dòng của run.jsonl → các sự kiện hiển thị.
 * `null` = dòng không phải JSON (rác thật). `[]` = JSON hợp lệ nhưng không có
 * gì để hiển thị — hai chuyện khác nhau, người gọi chỉ đếm loại đầu.
 */
export function phanTichDong(dong: string): SuKien[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(dong);
  } catch {
    return null;
  }
  if (!laObject(raw)) return null;

  switch (raw.type) {
    case "bee_lifecycle":
      return typeof raw.msg === "string"
        ? [{ loai: "lifecycle", text: raw.msg, ...(typeof raw.ts === "string" ? { ts: raw.ts } : {}) }]
        : [];
    case "bee_user_say":
      return typeof raw.text === "string"
        ? [{ loai: "nguoi-noi", text: raw.text, ...(typeof raw.ts === "string" ? { ts: raw.ts } : {}) }]
        : [];
    case "bee_replayed":
      return [{ loai: "replay", boQua: typeof raw.skipped === "number" ? raw.skipped : 0 }];
    case "bee_artifact": {
      // Nội dung run.jsonl là untrusted: kind phải nằm trong allowlist, và
      // url phải là GitHub thật — không mở cửa cho javascript: hay host lạ.
      if (raw.kind !== "issue" && raw.kind !== "pr") return [];
      if (typeof raw.url !== "string" || !raw.url.startsWith("https://github.com/")) return [];
      return [
        {
          loai: "artifact",
          kind: raw.kind,
          url: raw.url,
          number: typeof raw.number === "number" ? raw.number : null,
        },
      ];
    }
    case "assistant":
      return laObject(raw.message) ? tuContentBlocks(raw.message.content, "assistant") : [];
    case "user":
      return laObject(raw.message) ? tuContentBlocks(raw.message.content, "user") : [];
    case "stream_event": {
      // Chỉ lấy text_delta — thứ làm chữ chạy mượt. thinking/input_json/signature
      // delta không phải thứ người dùng cần thấy từng ký tự.
      const ev = raw.event;
      if (laObject(ev) && ev.type === "content_block_delta" && laObject(ev.delta)) {
        if (ev.delta.type === "text_delta" && typeof ev.delta.text === "string") {
          return [{ loai: "delta", text: ev.delta.text }];
        }
      }
      return [];
    }
    case "result":
      return [{ loai: "ket-qua", loi: raw.subtype !== "success" }];
    default:
      return [];
  }
}

/** Cả file (hoặc một khúc) → sự kiện + số dòng rác. */
export function gopSuKien(dongs: string[]): { suKien: SuKien[]; dongRac: number } {
  const suKien: SuKien[] = [];
  let dongRac = 0;
  for (const dong of dongs) {
    const ket = phanTichDong(dong);
    if (ket === null) dongRac += 1;
    else suKien.push(...ket);
  }
  return { suKien, dongRac };
}
