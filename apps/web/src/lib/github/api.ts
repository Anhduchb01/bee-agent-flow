import "server-only";

/**
 * Lớp mỏng bọc REST API của GitHub.
 *
 * Không dùng Octokit: nó kéo theo một cây phụ thuộc lớn cho đúng bảy endpoint,
 * và type của nó mô tả *response*, trong khi `types.ts` cố ý mô tả *thứ màn
 * hình cần*. Ranh giới ánh xạ nằm ở `map.ts`, không nằm ở đây.
 */
const BASE = process.env.GITHUB_API_URL ?? "https://api.github.com";

export class GithubError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "GithubError";
  }
}

/**
 * Token của **người đang bấm**, không phải token bot dùng chung.
 *
 * Thiếu token thì ném ngay chứ không gọi GitHub ẩn danh: ẩn danh vẫn đọc được
 * repo công khai, nên lỗi cấu hình sẽ hiện ra dưới dạng "repo private của bạn
 * biến mất" — một triệu chứng không ai đoán ra nguyên nhân.
 */
function headersFor(token: string | undefined): HeadersInit {
  if (!token) {
    throw new Error(
      "No GitHub token for the signed-in user. Sign out and back in; the OAuth app must request the repo scope.",
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function ghGet<T>(token: string | undefined, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headersFor(token), cache: "no-store" });
  if (!res.ok) throw new GithubError(res.status, path, await describeError(res, path));
  return (await res.json()) as T;
}

/**
 * Một lời gọi GraphQL thay cho `2 + 3N` lời gọi REST.
 *
 * Đo trên api.github.com: query lấy 100 issue + 100 PR kèm review và trạng thái
 * check tốn **1 điểm** trong hạn mức 5.000 điểm/giờ. Đường REST cũ tốn
 * `2 + 3 × số PR đang mở` lời gọi cho CÙNG một màn hình — repo 20 PR là 62 lời
 * gọi, mỗi lần tải trang.
 *
 * GraphQL của GitHub trả HTTP 200 kèm mảng `errors` cho lỗi truy vấn, nên
 * `res.ok` KHÔNG đủ để biết nó thành công. Đây là chỗ một bản viết ẩu đọc ra
 * `data: null` rồi hiện một danh sách rỗng như thể repo không có gì.
 */
export async function ghGraphQL<T>(
  token: string | undefined,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${BASE}/graphql`, {
    method: "POST",
    headers: { ...headersFor(token), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new GithubError(res.status, "/graphql", await describeError(res, "/graphql"));

  const body = (await res.json()) as {
    data?: T;
    errors?: Array<{ message?: string; type?: string }>;
  };
  if (body.errors?.length) {
    const msg = body.errors.map((e) => e.message ?? "?").join(" · ");
    // GraphQL báo thiếu quyền bằng `type` trong THÂN, HTTP vẫn 200. Ánh xạ về
    // đúng mã để `neuTokenHong` xử lý y như đường REST — nếu không thì phiên
    // hết hạn ở đây sẽ ra một lỗi 422 khó hiểu thay vì lời mời đăng nhập lại.
    const type = body.errors[0]?.type;
    const status = type === "FORBIDDEN" ? 403 : type === "NOT_FOUND" ? 404 : 422;
    throw new GithubError(status, "/graphql", `GitHub GraphQL: ${msg}`);
  }
  if (!body.data) throw new GithubError(502, "/graphql", "GitHub GraphQL trả về thân rỗng");
  return body.data;
}

export async function ghSend<T>(
  token: string | undefined,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...headersFor(token), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new GithubError(res.status, path, await describeError(res, path));
  // 204 No Content — `DELETE /labels/{name}` trả về thân rỗng.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Thông điệp lỗi phải nói được PHẢI LÀM GÌ. `HTTP 403` trần trụi là thứ đã tốn
 * của dự án này một buổi chiều ở P1.1, khi PAT thiếu quyền "Commit statuses".
 */
async function describeError(res: Response, path: string): Promise<string> {
  let detail = "";
  try {
    detail = ((await res.json()) as { message?: string }).message ?? "";
  } catch {
    /* thân không phải JSON — không sao, đã có mã trạng thái */
  }

  if (res.status === 401) {
    return `GitHub rejected the token (401). Sign out and back in. [${path}]`;
  }
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = res.headers.get("x-ratelimit-reset");
    const at = reset ? new Date(Number(reset) * 1000).toISOString() : "unknown";
    return `GitHub rate limit exhausted, resets at ${at}. [${path}]`;
  }
  if (res.status === 403) {
    return `Your GitHub account cannot do this (403): ${detail}. Check that you have write access to the repository. [${path}]`;
  }
  if (res.status === 404) {
    return `Not found, or your account cannot see it (404) — GitHub answers 404 instead of 403 for repositories you cannot read. [${path}]`;
  }
  return `GitHub returned ${res.status}: ${detail} [${path}]`;
}
