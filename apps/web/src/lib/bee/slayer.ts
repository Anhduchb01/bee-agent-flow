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

export interface BeeMucDung {
  /** Phần trăm đã dùng, 0–100. */
  phanTram: number;
  /** Lúc cửa sổ này reset, epoch giây; null = không biết. */
  resetLuc: number | null;
}

export interface BeeSlotClaude {
  index: number;
  name: string;
  alias: string | null;
  email: string | null;
  /** Chuỗi trạng thái slayer trả về: active · idle · reauth… */
  state: string;
  dangBat: boolean;
  namGio: BeeMucDung | null;
  bayNgay: BeeMucDung | null;
  /** Token của slot đã hết hạn — slot còn đó nhưng đăng nhập lại mới dùng được. */
  hetHan: boolean;
}

export interface BeePoolClaude {
  /** Tên slot đang bật, hoặc null khi chưa slot nào được chọn. */
  dangBat: string | null;
  slots: BeeSlotClaude[];
}

function so(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function chuoi(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function mucDung(v: unknown): BeeMucDung | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const pt = so(o.utilization);
  if (pt === null) return null;
  // Kẹp lại: thanh 130% vẽ ra khỏi khung, và một con số vô lý đọc như lỗi
  // hiển thị chứ không như cảnh báo.
  return { phanTram: Math.max(0, Math.min(100, pt)), resetLuc: so(o.resets_at) };
}

/**
 * Đọc `tok list --json`. Trả null khi tài liệu không phải thứ ta biết đọc —
 * đoán mò cấu trúc của công cụ bên thứ ba là cách êm nhất để hiện sai tài
 * khoản đang bật, mà đó lại đúng thứ người dùng tin để bấm.
 */
export function docPoolSlayer(json: string): BeePoolClaude | null {
  let tai: unknown;
  try {
    tai = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof tai !== "object" || tai === null) return null;
  const o = tai as Record<string, unknown>;
  if (typeof o.schema === "string" && !o.schema.startsWith("accounts@")) return null;
  if (!Array.isArray(o.accounts)) return null;

  const slots: BeeSlotClaude[] = [];
  for (const raw of o.accounts) {
    if (typeof raw !== "object" || raw === null) continue;
    const a = raw as Record<string, unknown>;
    const name = chuoi(a.name);
    if (name === null) continue;
    const usage = (typeof a.usage === "object" && a.usage !== null ? a.usage : {}) as Record<
      string,
      unknown
    >;
    slots.push({
      index: so(a.index) ?? slots.length + 1,
      name,
      alias: chuoi(a.alias),
      email: chuoi(a.email),
      state: chuoi(a.state) ?? "unknown",
      dangBat: a.active === true,
      namGio: mucDung(usage.five_hour),
      bayNgay: mucDung(usage.seven_day),
      hetHan: usage.token_expired === true,
    });
  }
  return { dangBat: chuoi(o.active), slots };
}

/**
 * Mục tiêu của `tok switch`: số thứ tự, tên, alias hoặc email. Chuỗi này đi
 * thẳng vào argv nên chỉ nhận đúng bộ ký tự tên/email hợp lệ — không
 * khoảng trắng, không dấu nháy, không gì shell đọc ra nghĩa khác.
 */
export function laMucTieuSlot(s: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/.test(s.trim());
}

/**
 * Tên slot mới. Hẹp hơn mục tiêu: không nhận `@` để một slot không bao giờ
 * mang tên trông như email của tài khoản khác.
 */
export function laTenSlot(s: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(s.trim());
}

/**
 * Token token-slayer (đo trên máy: 47 ký tự URL-safe). Kiểm hình dạng để
 * một chuỗi dán nhầm không được truyền cho trình cài đặt, chứ không phải
 * để xác thực — chỉ máy chủ của họ mới nói được token đúng hay sai.
 */
export function laTokenSlayer(s: string): boolean {
  return /^[A-Za-z0-9_-]{20,128}$/.test(s.trim());
}
