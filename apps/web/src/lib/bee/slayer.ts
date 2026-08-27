/**
 * token-slayer: nhiều tài khoản Claude trên cùng một máy, đổi qua lại được.
 *
 * Nó giữ credential của từng tài khoản trong `~/.config/token_slayer/
 * accounts/<email>.json`, và slot nào đang bật thì ghi ra
 * `~/.claude/.credentials.json` — đúng file mà `claude` đọc. Nghĩa là
 * "đổi tài khoản" là một hành động **toàn máy**, không phải per-phiên.
 *
 * File này chỉ có phần thuần: đọc tài liệu `accounts@1` và canh cổng cho
 * mọi thứ sắp đi vào argv. Phần gọi lệnh nằm ở `slayer-ctl.ts`.
 */

export interface BeeToolUse {
  /** Phần trăm đã dùng, 0–100. */
  percentOf: number;
  /** Lúc cửa sổ này reset, epoch giây; null = không biết. */
  resetAt: number | null;
}

export interface BeeSlotClaude {
  index: number;
  name: string;
  alias: string | null;
  email: string | null;
  /** Chuỗi trạng thái slayer trả về: active · idle · reauth… */
  state: string;
  enabled: boolean;
  fiveHour: BeeToolUse | null;
  sevenDay: BeeToolUse | null;
  /** Token của slot đã hết hạn — slot còn đó nhưng đăng nhập lại mới dùng được. */
  expired: boolean;
}

export interface BeeClaudePool {
  /** Tên slot đang bật, hoặc null khi chưa slot nào được chọn. */
  enabled: string | null;
  slots: BeeSlotClaude[];
}

function count(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function toolUse(v: unknown): BeeToolUse | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const pt = count(o.utilization);
  if (pt === null) return null;
  // Kẹp lại: thanh 130% vẽ ra khỏi khung, và một con số vô lý đọc như lỗi
  // hiển thị chứ không như cảnh báo.
  return { percentOf: Math.max(0, Math.min(100, pt)), resetAt: count(o.resets_at) };
}

/**
 * Đọc `tok list --json`. Trả null khi tài liệu không phải thứ ta biết đọc —
 * đoán mò cấu trúc của công cụ bên thứ ba là cách êm nhất để hiện sai tài
 * khoản đang bật, mà đó lại đúng thứ người dùng tin để bấm.
 */
export function readSlayerPool(json: string): BeeClaudePool | null {
  let load: unknown;
  try {
    load = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof load !== "object" || load === null) return null;
  const o = load as Record<string, unknown>;
  if (typeof o.schema === "string" && !o.schema.startsWith("accounts@")) return null;
  if (!Array.isArray(o.accounts)) return null;

  const slots: BeeSlotClaude[] = [];
  for (const raw of o.accounts) {
    if (typeof raw !== "object" || raw === null) continue;
    const a = raw as Record<string, unknown>;
    const name = str(a.name);
    if (name === null) continue;
    const usage = (typeof a.usage === "object" && a.usage !== null ? a.usage : {}) as Record<
      string,
      unknown
    >;
    slots.push({
      index: count(a.index) ?? slots.length + 1,
      name,
      alias: str(a.alias),
      email: str(a.email),
      state: str(a.state) ?? "unknown",
      enabled: a.active === true,
      fiveHour: toolUse(usage.five_hour),
      sevenDay: toolUse(usage.seven_day),
      expired: usage.token_expired === true,
    });
  }
  return { enabled: str(o.active), slots };
}

/**
 * Mục tiêu của `tok switch`: số thứ tự, tên, alias hoặc email. Chuỗi này đi
 * thẳng vào argv nên chỉ nhận đúng bộ ký tự tên/email hợp lệ — không
 * khoảng trắng, không dấu nháy, không gì shell đọc ra nghĩa khác.
 */
export function isSlotTarget(s: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/.test(s.trim());
}

/**
 * Tên slot mới. Hẹp hơn mục tiêu: không nhận `@` để một slot không bao giờ
 * mang tên trông như email của tài khoản khác.
 */
export function isSlotName(s: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(s.trim());
}

/**
 * Token token-slayer (đo trên máy: 47 ký tự URL-safe). Kiểm hình dạng để
 * một chuỗi dán nhầm không được truyền cho trình cài đặt, chứ không phải
 * để xác thực — chỉ máy chủ của họ mới nói được token đúng hay sai.
 */
export function isSlayerToken(s: string): boolean {
  return /^[A-Za-z0-9_-]{20,128}$/.test(s.trim());
}
