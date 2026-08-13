import { isAllowed, roleOf, type Role } from "./allowlist";

/**
 * Hai callback của NextAuth, tách khỏi `NextAuth({...})` để test được mà không
 * phải dựng cả một vòng OAuth.
 *
 * Bài test đáng giá nhất ở đây là bài khẳng định **không có token nào trong
 * payload đi ra client**. Nó không kiểm một tính năng — nó canh một thứ chỉ cần
 * một dòng `...token` đặt nhầm chỗ là hỏng, và hỏng im lặng.
 */
export interface TokenFields {
  login?: string;
  displayName?: string;
  avatar_url?: string;
  access_token?: string;
  [key: string]: unknown;
}

export interface SessionFields {
  login: string;
  displayName: string;
  allowed: boolean;
  role: Role;
  [key: string]: unknown;
}

/** Trường mà GitHub trả về trong `profile`, và trường của provider giả trong `user`. */
export interface ProfileLike {
  login?: unknown;
  name?: unknown;
  avatar_url?: unknown;
  image?: unknown;
}

export function fillToken(
  token: TokenFields,
  input: { profile?: ProfileLike; user?: ProfileLike; accessToken?: string },
): TokenFields {
  const src = input.profile ?? input.user;
  if (src) {
    const login = String(src.login ?? "");
    token.login = login;
    token.displayName = String(src.name ?? login);
    token.avatar_url = String(src.avatar_url ?? src.image ?? "");
  }
  if (input.accessToken) token.access_token = input.accessToken;
  return token;
}

export function fillSession<T extends object>(
  session: T,
  token: TokenFields,
): T & SessionFields {
  const login = token.login ?? "";
  const out = {
    ...session,
    login,
    displayName: token.displayName ?? login,
    allowed: login !== "" && isAllowed(login),
    role: roleOf(login),
  } as T & SessionFields;

  // Cắt tường minh chứ không dựa vào việc "chưa gán vào". Nếu ai đó thêm một
  // `...token` ở trên thì hai dòng này là thứ duy nhất còn chặn.
  const bare = out as Record<string, unknown>;
  delete bare.access_token;
  delete bare.accessToken;
  return out;
}
