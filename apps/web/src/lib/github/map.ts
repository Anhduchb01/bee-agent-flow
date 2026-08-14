/**
 * Ánh xạ response thật của GitHub sang `types.ts`.
 *
 * Tách khỏi `live.ts` vì đây là chỗ duy nhất sai được theo kiểu im lặng: một
 * trường đổi tên thì `undefined` chảy ra giữa màn hình, ở một chỗ cách xa
 * nguyên nhân. Ở đây nó test được — và nó ĐƯỢC test bằng payload tải thật về từ
 * api.github.com (`__real__/`), không phải bằng object viết theo trí nhớ.
 */
import type {
  CheckConclusion,
  GhCheck,
  GhComment,
  GhLabel,
  GhPull,
  GhReview,
  GhTask,
  GhUser,
} from "./types";

/**
 * Chỉ khai báo những trường thực sự đọc tới, và **tất cả đều tuỳ chọn**.
 *
 * Không mô tả cả response: GitHub trả về hơn ba mươi trường cho một issue, và
 * một type đầy đủ sẽ biến mọi lần GitHub thêm trường thành một lần sửa code.
 * Tuỳ chọn hết vì đây là dữ liệu từ mạng — `strict` không kiểm hộ được gì ở
 * ranh giới này, nên các hàm dưới đây phải tự chịu trách nhiệm.
 */
export interface ApiUser {
  login?: string;
  name?: string | null;
  avatar_url?: string;
}

export interface ApiIssue {
  number?: number;
  title?: string;
  body?: string | null;
  labels?: Array<{ name?: string } | string>;
  user?: ApiUser;
  created_at?: string;
  updated_at?: string;
  html_url?: string;
  state?: string;
  /** Chỉ có mặt khi mục này thực ra là một pull request. Xem `laPullRequest`. */
  pull_request?: unknown;
}

export interface ApiPull {
  number: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  draft?: boolean;
  head?: { sha?: string };
}

export interface ApiComment {
  id?: number;
  body?: string | null;
  user?: ApiUser;
  created_at?: string;
}

const s = (v: unknown): string => (typeof v === "string" ? v : "");

/** Nhãn app biết. Nhãn riêng của repo (`bug`, `duplicate`, …) bị bỏ, không ép kiểu. */
const NHAN: readonly GhLabel[] = [
  "agent:eligible",
  "agent:build",
  "agent:running",
  "agent:built",
  "needs-human",
  "priority:high",
  "preview:on",
  "status:draft",
  "status:ready-for-spec",
  "status:spec-review",
];

/**
 * Payload issue/PR của GitHub **không mang tên thật của người dùng** — chỉ có
 * `login` và `avatar_url`. Lấy tên thật là thêm một lời gọi `/users/{login}`
 * cho mỗi người, mỗi lần render.
 *
 * Nên `name` lùi về `login`. Đây là một khác biệt thật so với fixture, nơi ai
 * cũng có tên đẹp — và nó phải lộ ra ở đây chứ không phải ở màn hình.
 */
export function mapUser(raw: ApiUser | undefined): GhUser {
  const login = s(raw?.login) || "unknown";
  return {
    login,
    name: typeof raw?.name === "string" && raw.name ? raw.name : login,
    avatar_url: s(raw?.avatar_url),
  };
}

export function mapLabels(raw: ApiIssue["labels"]): GhLabel[] {
  if (!Array.isArray(raw)) return [];
  const ten = raw.map((l) => (typeof l === "string" ? l : s(l?.name)));
  return NHAN.filter((k) => ten.includes(k));
}

/**
 * `GET /repos/{r}/issues` **trả về cả pull request**. Đó là hành vi có tài liệu
 * của endpoint này và là cái bẫy kinh điển của nó: không lọc thì mỗi PR hiện ra
 * thêm một lần như một task riêng, mang đúng số của nó, và bảng việc dài gấp
 * đôi mà không ai hiểu vì sao.
 *
 * Dấu hiệu duy nhất là sự có mặt của khoá `pull_request` — kiểm bằng `in`, chứ
 * không bằng giá trị: nó là một object, và một object rỗng vẫn falsy-an-toàn
 * theo cách khác với `undefined`.
 */
export function laPullRequest(raw: ApiIssue): boolean {
  return raw != null && "pull_request" in raw;
}

export function mapTask(slug: string, raw: ApiIssue, pull: GhPull | null): GhTask {
  return {
    slug,
    number: typeof raw.number === "number" ? raw.number : 0,
    title: s(raw.title),
    // `body` là `null` khi issue không có mô tả — không phải chuỗi rỗng, và
    // `null.length` là một lỗi runtime ở giữa trang chi tiết.
    body: typeof raw.body === "string" ? raw.body : "",
    labels: mapLabels(raw.labels),
    author: mapUser(raw.user),
    created_at: s(raw.created_at),
    updated_at: s(raw.updated_at) || s(raw.created_at),
    url: s(raw.html_url),
    state: raw.state === "closed" ? "closed" : "open",
    pull,
  };
}

export function mapPull(raw: ApiPull, checks: GhCheck[], reviews: GhReview[]): GhPull {
  return {
    number: raw.number,
    title: s(raw.title),
    url: s(raw.html_url),
    draft: raw.draft === true,
    head_sha: s(raw.head?.sha),
    checks,
    reviews,
  };
}

export function mapReviews(raw: unknown): GhReview[] {
  if (!Array.isArray(raw)) return [];
  const out: GhReview[] = [];
  for (const r of raw as Array<{ state?: string; user?: ApiUser; submitted_at?: string }>) {
    const state = s(r?.state);
    // `PENDING` là review người ta đang soạn dở và CHƯA gửi; `DISMISSED` là
    // review đã bị gỡ hiệu lực. Đưa cả hai vào danh sách là hiện một chữ ký
    // chưa được ký, hoặc một chữ ký đã bị rút lại.
    if (state !== "APPROVED" && state !== "CHANGES_REQUESTED" && state !== "COMMENTED") continue;
    out.push({ author: mapUser(r?.user), state, submitted_at: s(r?.submitted_at) });
  }
  return out;
}

/**
 * Hai nguồn, và bỏ sót nguồn nào cũng mất thông tin:
 *
 *   `/commits/{sha}/status`     ← commit status. bee đẩy `bee/test` và
 *                                 `bee/approvals` vào đây (`gh_set_status`).
 *   `/commits/{sha}/check-runs` ← GitHub Actions và các app khác.
 *
 * Chúng là hai API tách rời với hai hình dạng khác nhau. Chỉ đọc một thì hoặc
 * mất hết cổng của bee, hoặc mất hết CI của repo.
 */
export function mapChecks(statusRaw: unknown, checkRunsRaw: unknown): GhCheck[] {
  const out: GhCheck[] = [];

  const st = statusRaw as { statuses?: Array<{ context?: string; state?: string }> } | null;
  for (const x of st?.statuses ?? []) {
    out.push({ name: s(x?.context), conclusion: ketLuanStatus(s(x?.state)) });
  }

  const cr = checkRunsRaw as {
    check_runs?: Array<{ name?: string; status?: string; conclusion?: string | null }>;
  } | null;
  for (const x of cr?.check_runs ?? []) {
    out.push({
      name: s(x?.name),
      // `conclusion` là `null` cho tới khi chạy xong. Đang chạy KHÔNG phải
      // `neutral` — hiện nó màu xám là nói rằng CI đã có kết luận.
      conclusion: x?.status === "completed" ? ketLuanCheckRun(s(x?.conclusion)) : "pending",
    });
  }

  return out;
}

function ketLuanStatus(state: string): CheckConclusion {
  if (state === "success") return "success";
  if (state === "failure" || state === "error") return "failure";
  if (state === "pending") return "pending";
  return "neutral";
}

function ketLuanCheckRun(c: string): CheckConclusion {
  if (c === "success") return "success";
  if (c === "failure" || c === "timed_out" || c === "action_required") return "failure";
  return "neutral";
}

/**
 * Issue mà PR này đóng, lấy từ **từ khoá đóng của GitHub** trong body.
 *
 * Không dùng timeline API: nó tốn một lời gọi cho mỗi PR và trả về hàng chục
 * loại sự kiện. bee luôn viết `Closes #<số>` khi mở PR
 * (`worktree_push_and_report`), còn PR do người mở thì dùng đúng cú pháp này để
 * GitHub tự đóng issue — nên một biểu thức là đủ cho cả hai.
 *
 * Lấy số ĐẦU TIÊN: một PR đóng nhiều issue là chuyện có thật, nhưng bảng việc
 * cần đúng một chỗ để gắn nó vào, và chỗ đầu tiên là chỗ tác giả viết trước.
 */
const TU_KHOA = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)/i;

export function issueCuaPr(body: string | null | undefined): number | null {
  const m = TU_KHOA.exec(typeof body === "string" ? body : "");
  if (!m) return null;
  const num = Number(m[1]);
  return Number.isFinite(num) ? num : null;
}

/**
 * Comment do agent viết. Trên GitHub nó mang tên chủ token orch chứ không có
 * tài khoản riêng, nên nhận diện bằng dấu `<!-- agent-run -->` — cùng chuỗi mà
 * rule 02 dùng để khỏi tự trả lời chính mình.
 */
export function mapComment(raw: ApiComment, kind: GhComment["kind"]): GhComment {
  const body = typeof raw?.body === "string" ? raw.body : "";
  return {
    id: typeof raw?.id === "number" ? raw.id : 0,
    author: mapUser(raw?.user),
    body,
    created_at: s(raw?.created_at),
    kind,
    from_agent: body.includes("<!-- agent-run -->"),
  };
}
