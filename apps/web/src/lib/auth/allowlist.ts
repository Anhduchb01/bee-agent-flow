/**
 * Ai được vào, và với vai trò gì.
 *
 * Không có `import "server-only"` ở đây vì file chỉ đọc biến môi trường và làm
 * việc trên chuỗi — nhưng nó vẫn chỉ được gọi từ phía server (`auth.ts` và các
 * route handler). Tách riêng để test được mà không phải dựng cả NextAuth.
 */
export type Role = "pm" | "tl";

/** Chỉ cần đọc, nên không buộc phải là cả `NodeJS.ProcessEnv` — test truyền vào một object nhỏ. */
export type Env = Record<string, string | undefined>;

function list(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Trên dữ liệu thật, `ALLOWED_LOGINS` rỗng nghĩa là **không ai vào được** —
 * không phải "ai cũng vào được". Mặc định mở là kiểu lỗi cấu hình chỉ lộ ra khi
 * đã có người lạ ở trong, mà app này thì đưa lên internet.
 *
 * Trên fixture thì hai người dùng mẫu là allowlist, để chạy được ngay mà không
 * cần dựng GitHub OAuth app.
 */
export function allowedLogins(env: Env = process.env): string[] {
  const explicit = list(env.ALLOWED_LOGINS);
  if (explicit.length > 0) return explicit;
  return env.GITHUB_SOURCE === "live" ? [] : ["pm-linh", "tl-duc"];
}

export function isAllowed(login: string, env: Env = process.env): boolean {
  return allowedLogins(env).includes(login.trim().toLowerCase());
}

/** Không nằm trong `BEE_TL_LOGINS` thì là PM — vai trò rộng quyền hơn nằm ở PM. */
export function roleOf(login: string, env: Env = process.env): Role {
  const tl = list(env.BEE_TL_LOGINS);
  const fallback = env.GITHUB_SOURCE === "live" ? [] : ["tl-duc"];
  return (tl.length > 0 ? tl : fallback).includes(login.trim().toLowerCase()) ? "tl" : "pm";
}
