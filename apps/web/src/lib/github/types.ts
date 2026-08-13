/**
 * Hình dạng dữ liệu GitHub mà app dùng — **không** phải hình dạng response của
 * API. `live.ts` chịu trách nhiệm ánh xạ; mọi lệch giữa hai bên sửa ở đó.
 *
 * Vì sao không dùng thẳng type của Octokit: response thật mang theo hàng trăm
 * trường và ba cách khác nhau để nói cùng một việc (REST v3, GraphQL, search).
 * Màn hình bám vào chúng thì một lần đổi endpoint là phải sửa cả tầng UI.
 */

export interface GhUser {
  login: string;
  name: string;
  avatar_url: string;
}

/** Nhãn của reconciler. Danh sách đầy đủ ở `repo_sync_labels()` trong `bin/bee`. */
export type GhLabel =
  | "agent:eligible"
  | "agent:build"
  | "agent:running"
  | "agent:built"
  | "needs-human"
  | "priority:high"
  | "preview:on"
  | "status:draft"
  | "status:ready-for-spec"
  | "status:spec-review";

export interface GhRepo {
  slug: string;
  full: string;
}

export interface GhComment {
  id: number;
  author: GhUser;
  body: string;
  created_at: string;
  /** `issue` = comment thường · `review` = comment trên diff (rule 02 quét chỗ này). */
  kind: "issue" | "review";
  /**
   * Comment do agent viết. Trên GitHub nó mang tên chủ token orch chứ không có
   * tài khoản riêng, nên nhận diện bằng dấu `<!-- agent-run -->` mà rule 08 và
   * rule 02 chèn vào đầu nội dung.
   */
  from_agent: boolean;
}

export type CheckConclusion = "success" | "failure" | "pending" | "neutral";

export interface GhCheck {
  name: string;
  conclusion: CheckConclusion;
}

export interface GhReview {
  author: GhUser;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED";
  submitted_at: string;
}

export interface GhPull {
  number: number;
  title: string;
  url: string;
  draft: boolean;
  head_sha: string;
  checks: GhCheck[];
  reviews: GhReview[];
}

/**
 * Issue cộng PR liên kết, gộp thành **một** thứ — vì với người dùng đó là một
 * việc. Chia đôi trên màn hình là bắt họ tự ghép lại trong đầu.
 */
export interface GhTask {
  slug: string;
  number: number;
  title: string;
  body: string;
  labels: GhLabel[];
  author: GhUser;
  created_at: string;
  updated_at: string;
  url: string;
  state: "open" | "closed";
  pull: GhPull | null;
}

/** Năm mục bắt buộc của `.github/ISSUE_TEMPLATE/task.yml`. */
export interface NewTaskInput {
  slug: string;
  title: string;
  goal: string;
  acceptance: string;
  constraints: string;
  out_of_scope: string;
  ui_reference: string;
}

/**
 * Người đang đăng nhập. Mọi ghi lên GitHub đi kèm một `Actor` — không có token
 * bot dùng chung, vì dấu vết kiểm toán chỉ đúng khi nó mang tên người đã bấm.
 */
export interface Actor extends GhUser {
  role: "pm" | "tl";
  /** Chỉ có ở phía server, và không bao giờ đi ra client. `live.ts` dùng nó. */
  token?: string;
}

export interface GithubSource {
  listRepos(): Promise<GhRepo[]>;
  listTasks(): Promise<GhTask[]>;
  getTask(slug: string, num: number): Promise<GhTask | null>;
  listTimeline(slug: string, num: number): Promise<GhComment[]>;

  createTask(input: NewTaskInput, actor: Actor): Promise<GhTask>;
  addComment(slug: string, num: number, body: string, actor: Actor): Promise<GhComment>;
  addLabel(slug: string, num: number, label: GhLabel, actor: Actor): Promise<GhTask>;
  removeLabel(slug: string, num: number, label: GhLabel, actor: Actor): Promise<GhTask>;
  /** Approve PR. **Không có merge** — merge chỉ xảy ra trên GitHub, do người làm. */
  approve(slug: string, num: number, actor: Actor): Promise<GhTask>;
}
