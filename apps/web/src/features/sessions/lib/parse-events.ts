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

export type StreamEvent =
  | { loai: "lifecycle"; text: string; ts?: string }
  | { loai: "nguoi-noi"; text: string; ts?: string }
  | { loai: "agent-noi"; text: string }
  | { loai: "delta"; text: string }
  /** Khối thinking trọn vẹn trong message — UI gập mặc định. */
  | { loai: "nghi"; text: string }
  /** Thinking đang chảy — hook gom buffer riêng, message trọn vẹn thay thế. */
  | { loai: "nghi-delta"; text: string }
  /**
   * `id` là tool_use id của CLI — chìa khoá để ghép cặp với `tool-xong` thành
   * MỘT thẻ có trạng thái (spinner → ✓), thay vì hai dòng rời. `file`/`lenh`
   * trích sẵn cho thẻ chuyên biệt (Edit/Write/Bash).
   */
  | {
      loai: "tool";
      ten: string;
      thamSo: string;
      id?: string | null;
      file?: string;
      lenh?: string;
      /** Edit: old_string/new_string — đủ cho khối diff đỏ/xanh kiểu VSCode. */
      cu?: string;
      moi?: string;
    }
  | { loai: "tool-xong"; text: string; id?: string | null; loi?: boolean }
  | {
      loai: "ket-qua";
      loi: boolean;
      luot?: number | null;
      nguCanh?: number | null;
      /** Raw numbers behind the ring — the % alone reads as "wrong" when
          the window is 1M and the system prompt already costs 100k. */
      dungToken?: number | null;
      cuaSoToken?: number | null;
    }
  | { loai: "replay"; skipped: number }
  /**
   * `bee_truncated` — log ĐÃ BỊ CẮT vĩnh viễn để giữ trần đĩa (spec §11).
   * Khác hẳn `replay` (chỉ là người xem vào muộn): dữ liệu này không còn nữa,
   * và người đọc phải biết trước khi kết luận agent đã làm gì.
   */
  | { loai: "da-cat"; skipped: number }
  /**
   * system/compact_boundary — the CLI compacted the conversation (auto near
   * the window limit, or a sent /compact). Without a visible seam the ring
   * dropping from 90% to 20% reads as a bug, not a rescue.
   */
  | { loai: "compact"; trigger: "manual" | "auto"; preTokens: number | null }
  /** Manual mode (V2.5b): the agent asks permission for one tool call. */
  | { loai: "xin-quyen"; requestId: string; ten: string; thamSo: string }
  /** The owner's recorded answer (bee_approval) — pairs by requestId. */
  | { loai: "quyen-da-tra-loi"; requestId: string; choPhep: boolean }
  | {
      loai: "artifact";
      kind: "issue" | "pr";
      url: string;
      number: number | null;
      title: string | null;
    };

const CAT_THAM_SO = 160;
const CAT_KET_QUA = 400;
const CAT_DIFF = 2000;

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

function tuContentBlocks(content: unknown, nguon: "assistant" | "user"): StreamEvent[] {
  if (!Array.isArray(content)) return [];
  const ra: StreamEvent[] = [];
  for (const block of content) {
    if (!laObject(block)) continue;
    if (nguon === "assistant" && block.type === "text" && typeof block.text === "string") {
      if (block.text.trim() !== "") ra.push({ loai: "agent-noi", text: block.text });
    }
    if (nguon === "assistant" && block.type === "thinking" && typeof block.thinking === "string") {
      if (block.thinking.trim() !== "") ra.push({ loai: "nghi", text: block.thinking });
    }
    if (nguon === "assistant" && block.type === "tool_use") {
      const input = laObject(block.input) ? block.input : {};
      // Edit mang old/new, Write mang content — giữ lại (có trần) để vẽ khối
      // diff đỏ/xanh. Các tool khác chỉ cần thamSo cắt gọn.
      const cu = typeof input.old_string === "string" ? input.old_string : undefined;
      const moi =
        typeof input.new_string === "string"
          ? input.new_string
          : typeof input.content === "string"
            ? input.content
            : undefined;
      ra.push({
        loai: "tool",
        ten: typeof block.name === "string" ? block.name : "?",
        thamSo: cat(JSON.stringify(block.input ?? {}), CAT_THAM_SO),
        id: typeof block.id === "string" ? block.id : null,
        ...(typeof input.file_path === "string" ? { file: input.file_path } : {}),
        ...(typeof input.command === "string" ? { lenh: cat(input.command, CAT_THAM_SO) } : {}),
        ...(cu !== undefined ? { cu: cat(cu, CAT_DIFF) } : {}),
        ...(moi !== undefined ? { moi: cat(moi, CAT_DIFF) } : {}),
      });
    }
    if (nguon === "user" && block.type === "tool_result") {
      ra.push({
        loai: "tool-xong",
        text: cat(textCuaToolResult(block.content), CAT_KET_QUA),
        id: typeof block.tool_use_id === "string" ? block.tool_use_id : null,
        loi: block.is_error === true,
      });
    }
  }
  return ra;
}

/**
 * Một dòng của run.jsonl → các sự kiện hiển thị.
 * `null` = dòng không phải JSON (rác thật). `[]` = JSON hợp lệ nhưng không có
 * gì để hiển thị — hai chuyện khác nhau, người gọi chỉ đếm loại đầu.
 */
export function parseLine(line: string): StreamEvent[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
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
      return [{ loai: "replay", skipped: typeof raw.skipped === "number" ? raw.skipped : 0 }];
    case "bee_truncated":
      return [{ loai: "da-cat", skipped: typeof raw.skipped === "number" ? raw.skipped : 0 }];
    case "system": {
      // Whitelist: only compact_boundary becomes UI; init, api_retry,
      // thinking_tokens… stay silent (see the file header's principle).
      if (raw.subtype !== "compact_boundary") return [];
      const md = laObject(raw.compact_metadata) ? raw.compact_metadata : {};
      return [
        {
          loai: "compact",
          trigger: md.trigger === "manual" ? "manual" : "auto",
          preTokens: typeof md.pre_tokens === "number" ? md.pre_tokens : null,
        },
      ];
    }
    case "control_request": {
      // Manual mode: --permission-prompt-tool stdio routes permission
      // prompts onto the stream (rig-05). Only can_use_tool becomes UI.
      const req = raw.request;
      if (!laObject(req) || req.subtype !== "can_use_tool") return [];
      if (typeof raw.request_id !== "string" || typeof req.tool_name !== "string") return [];
      let thamSo = "{}";
      try {
        thamSo = JSON.stringify(req.input ?? {});
      } catch {
        thamSo = "{}";
      }
      return [
        {
          loai: "xin-quyen",
          requestId: raw.request_id,
          ten: req.tool_name,
          thamSo: cat(thamSo, 64_000),
        },
      ];
    }
    case "bee_approval": {
      // Ghi bởi web SAU khi control_response đã vào FIFO — replay không mất
      // trạng thái đã-trả-lời của thẻ.
      if (typeof raw.request_id !== "string") return [];
      return [
        {
          loai: "quyen-da-tra-loi",
          requestId: raw.request_id,
          choPhep: raw.behavior === "allow",
        },
      ];
    }
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
          title: typeof raw.title === "string" ? raw.title.slice(0, 140) : null,
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
        if (ev.delta.type === "thinking_delta" && typeof ev.delta.thinking === "string") {
          if (ev.delta.thinking !== "") return [{ loai: "nghi-delta", text: ev.delta.thinking }];
        }
      }
      return [];
    }
    case "result": {
      // Context fill of the window — the number behind VSCode's ring.
      // MUST come from `usage` (the LAST turn's tokens = what sits in the
      // window right now), not from modelUsage: that one accumulates cache
      // reads across every turn of the session and hits "100%" in minutes.
      let nguCanh: number | null = null;
      let dung = 0;
      if (laObject(raw.usage)) {
        for (const k of ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) {
          const v = (raw.usage as Record<string, unknown>)[k];
          if (typeof v === "number") dung += v;
        }
      }
      let cua = 0;
      if (laObject(raw.modelUsage)) {
        for (const m of Object.values(raw.modelUsage as Record<string, unknown>)) {
          if (laObject(m) && typeof m.contextWindow === "number") {
            cua = Math.max(cua, m.contextWindow);
          }
        }
      }
      if (dung > 0 && cua > 0) nguCanh = Math.min(100, Math.round((dung / cua) * 100));
      return [
        {
          loai: "ket-qua",
          loi: raw.subtype !== "success",
          luot: typeof raw.num_turns === "number" ? raw.num_turns : null,
          nguCanh,
          dungToken: dung > 0 ? dung : null,
          cuaSoToken: cua > 0 ? cua : null,
        },
      ];
    }
    default:
      return [];
  }
}

/** Cả file (hoặc một khúc) → sự kiện + số dòng rác. */
export function gopSuKien(dongs: string[]): { events: StreamEvent[]; dongRac: number } {
  const events: StreamEvent[] = [];
  let dongRac = 0;
  for (const line of dongs) {
    const ket = parseLine(line);
    if (ket === null) dongRac += 1;
    else events.push(...ket);
  }
  return { events, dongRac };
}
