/**
 * Kiểm tra hình dạng của JSON do reconciler ghi ra.
 *
 * Đây là ranh giới giữa hai chương trình viết bằng hai ngôn ngữ khác nhau, đồng
 * bộ bằng tay. Tin vào `as BeeStatus` thì một trường đổi tên sẽ hiện ra dưới
 * dạng `undefined` giữa màn hình, ở một chỗ cách xa nguyên nhân. Kiểm ở đây thì
 * nó hiện ra đúng chỗ, kèm tên trường.
 */
import type {
  BeeClaudeRateLimit,
  BeeRecentRun,
} from "./types";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

class ShapeError extends Error {}

function fail(path: string, want: string): never {
  throw new ShapeError(`${path}: expected ${want}`);
}

function str(o: Obj, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== "string") fail(`${path}.${key}`, "a string");
  return v as string;
}

function num(o: Obj, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${path}.${key}`, "a number");
  return v as number;
}

/**
 * Số có thể vắng mặt. Dùng cho các trường mức dùng mà `record_run` chỉ ghi khi
 * lần chạy đó thực sự có gọi agent — dòng của rule 03 (chạy CI) không bao giờ
 * có, và những dòng ghi trước khi reconciler được sửa cũng không.
 *
 * Vắng mặt là `undefined`, không phải `0`: "không gọi agent" khác hẳn "gọi agent
 * mà tốn 0 token", và gộp hai thứ đó lại thì mọi phép cộng ở trên đều sai.
 */
function numOpt(o: Obj, key: string): number | undefined {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

function bool(o: Obj, key: string, path: string): boolean {
  const v = o[key];
  if (typeof v !== "boolean") fail(`${path}.${key}`, "true/false");
  return v as boolean;
}

function recentRun(v: unknown, path: string): BeeRecentRun {
  if (!isObj(v)) fail(path, "an object");
  return {
    id: str(v, "id", path),
    repo: str(v, "repo", path),
    number: num(v, "number", path),
    rule: str(v, "rule", path),
    result: str(v, "result", path),
    turns: num(v, "turns", path),
    duration_s: num(v, "duration_s", path),
    at: str(v, "at", path),

    // Mức dùng — tuỳ chọn, xem `numOpt`. Không đưa vào danh sách bắt buộc vì
    // như thế thì mọi dòng ghi trước khi reconciler được sửa sẽ bị vứt, và
    // biểu đồ bảy ngày mất sạch lịch sử ngay lúc nâng cấp.
    tokens_in: numOpt(v, "tokens_in"),
    tokens_out: numOpt(v, "tokens_out"),
    tokens_cache_read: numOpt(v, "tokens_cache_read"),
    tokens_cache_write: numOpt(v, "tokens_cache_write"),
    cost_usd: numOpt(v, "cost_usd"),

    // Giữ nguyên ba trạng thái: vắng mặt (không gọi agent), `null` (có gọi,
    // không lỗi), có giá trị. `?? null` ở đây sẽ xoá mất trạng thái thứ nhất.
    ...("stop_reason" in v ? { stop_reason: strOrNull(v.stop_reason) } : {}),
    ...("api_error_status" in v
      ? { api_error_status: numOpt(v, "api_error_status") ?? null }
      : {}),
    ...("session_id" in v ? { session_id: strOrNull(v.session_id) } : {}),
  };
}

export function parseClaudeRateLimit(text: string): BeeClaudeRateLimit | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  try {
    return {
      status: str(v, "status", "rate-limit"),
      resetsAt: num(v, "resetsAt", "rate-limit"),
      rateLimitType: str(v, "rateLimitType", "rate-limit"),
      overageStatus: str(v, "overageStatus", "rate-limit"),
      isUsingOverage: bool(v, "isUsingOverage", "rate-limit"),
      seen_at: str(v, "seen_at", "rate-limit"),
    };
  } catch (e) {
    if (e instanceof ShapeError) return null;
    throw e;
  }
}

/** Một dòng `recent.jsonl`. Dòng rác bị bỏ, không làm hỏng cả file. */
export function parseRecentLine(line: string): BeeRecentRun | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return recentRun(JSON.parse(trimmed), "recent");
  } catch {
    return null;
  }
}
