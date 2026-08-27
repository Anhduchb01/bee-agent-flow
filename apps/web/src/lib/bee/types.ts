/**
 * Hình dạng của những gì reconciler ghi ra đĩa.
 *
 * ĐỒNG BỘ TAY với `apps/runner/`. Đổi một bên thì đổi bên kia trong cùng
 * commit — không có gì tự kiểm tra giúp hai bên khớp nhau.
 *
 * Đối chiếu ngày 2026-08-13:
 *   - `status.json`     ← `status_write()`  · bin/reconcile.sh
 *   - mục trong `running` ← `claim_write()` · lib/state.sh, cộng `elapsed_s`
 *   - mục trong `queue` ← `QUEUE_JSON`      · bin/reconcile.sh
 *   - `recent.jsonl`    ← `record_run()`    · lib/state.sh
 *   - `state/claude-rate-limit.json` ← `run_agent()` · bin/worker.sh
 */

/** `mode` chỉ nhận hai giá trị: `status_write "running"` và `status_write "paused"`. */
export type BeeMode = "running" | "paused";

/** Hai bể tài nguyên tách rời — build và evidence không chặn nhau. */
export type BeePool = "build" | "evidence";

export interface BeeSlots {
  build: { used: number; max: number; per_repo_max: number };
  evidence: { used: number; max: number };
}

/** Một việc đang chạy: nội dung `claim.json` cộng `elapsed_s` tính lúc ghi. */
export interface BeeRunning {
  id: string;
  repo: string;
  number: number;
  rule: string;
  pool: BeePool;
  started_at: string;
  elapsed_s: number;
}

/**
 * Một việc khớp rule nhưng chưa được giao. `wait_reason` là trường đáng giá
 * nhất ở đây — nó trả lời "sao task của tôi chưa chạy?" mà không cần đọc log.
 */
export interface BeeQueueItem {
  repo: string;
  number: number;
  rule: string;
  title: string;
  wait_reason: string;
}

/** `result` do từng rule tự đặt; không phải một tập đóng. */
export interface BeeRecentRun {
  id: string;
  repo: string;
  number: number;
  rule: string;
  result: string;
  turns: number;
  duration_s: number;
  at: string;

  /*
   * Mức dùng của lần chạy — `record_run()` gộp vào từ `state/<id>/usage.json`.
   *
   * **Tuỳ chọn, và sẽ vắng mặt thường xuyên.** Dòng của rule 03 (chạy CI) không
   * gọi agent nên không bao giờ có; dòng ghi trước khi reconciler giữ lại
   * `usage` cũng không. `undefined` nghĩa là *không biết*, khác hẳn `0`.
   */
  tokens_in?: number;
  tokens_out?: number;
  tokens_cache_read?: number;
  tokens_cache_write?: number;
  cost_usd?: number;

  /**
   * Hai trường phân biệt được "chết vì hết hạn mức" với "chết vì test đỏ" —
   * nếu chỉ nhìn `result` thì cả hai đều là một giá trị khác `ok`.
   *
   * Vừa tuỳ chọn vừa nhận `null`, và hai thứ đó **khác nhau**: vắng mặt nghĩa
   * là lần chạy này không gọi agent, còn `null` nghĩa là có gọi và Claude không
   * báo lỗi nào. Gộp chúng lại thì "chạy CI" và "agent chạy trơn tru" trông
   * giống hệt nhau.
   */
  stop_reason?: string | null;
  api_error_status?: number | null;

  /**
   * Phiên Claude của lần chạy này — thứ DUY NHẤT cho phép nối lại cuộc hội
   * thoại đó. Bản chép đầy đủ nằm trong home của `bee-agent` và ở nguyên đó;
   * chỉ cái tên đi ra ngoài.
   *
   * `null` khi lần chạy không gọi agent (rule 03), và vắng mặt ở những dòng ghi
   * trước khi reconciler giữ lại trường này.
   */
  session_id?: string | null;
}

/**
 * `state/claude-rate-limit.json` ← `run_agent()` · bin/worker.sh
 *
 * Hạn mức là chuyện của **cả tài khoản**, không phải của một lần chạy, nên nó
 * nằm ngoài `recent.jsonl` và chỉ được ghi đè khi Claude CLI thực sự phát ra
 * một `rate_limit_event` — không phải lần chạy nào cũng có.
 *
 * Lấy nguyên hình dạng `rate_limit_info` đã kiểm chứng bằng cách chạy CLI thật
 * (v2.1.161), cộng `seen_at` do reconciler đóng dấu. **Không có phần trăm ở
 * đây** — không nguồn nào phát ra nó, xem `lib/claude/types.ts`.
 */
export interface BeeClaudeRateLimit {
  status: string;
  /** Epoch giây. */
  resetsAt: number;
  rateLimitType: string;
  overageStatus: string;
  isUsingOverage: boolean;
  seen_at: string;
}

export interface BeeRepo {
  slug: string;
  full: string;
  enabled: boolean;
  /** `.agent/PAUSE` trên nhánh mặc định — kill switch tầng repo. */
  paused: boolean;
  /** Số việc của repo này đang chạy, không phải danh sách. */
  running: number;
  wip: { max: number };
  queue: BeeQueueItem[];
  recent: BeeRecentRun[];
}

/**
 * What the health banner needs to say something true, and nothing more.
 *
 * Narrowed 27/08 when the reconciler went away. The old shape carried
 * `slots` (build/evidence pools), per-repo `queue`/`recent`/`wip`/`enabled`
 * and a `rule` per running item — the reconciler's rule-world model. The
 * runner is session-first: it has no rules and no pools, and not one of those
 * fields was read by any screen. Carrying them would have meant inventing
 * numbers to fill them.
 */
export interface BeeStatus {
  /** ISO of the reaper's last tick, from `heartbeat.json`. */
  heartbeat: string;
  /** The machine-wide kill switch: the `PAUSE` file's existence. */
  mode: BeeMode;
  /** How many sessions were running at that tick — a count, not a list. */
  running: number;
  /** Registered repos, from `repos.d` — the same list doctor checks. */
  repos: { slug: string; repo: string }[];
}

/**
 * Đọc `status.json` có bốn kết cục, và ba trong số đó không phải lỗi lập trình:
 * file chưa có (vừa cài), file hỏng (ghi dở), file cũ (reconciler chết). Cả ba
 * đều là thông tin phải hiện lên màn hình, nên chúng nằm trong kiểu trả về chứ
 * không ném ra ngoài dưới dạng exception.
 */
export type StatusRead =
  | { ok: true; status: BeeStatus; dropped: number }
  | { ok: false; reason: "missing" | "unreadable" | "malformed"; detail: string };

export interface EvidenceFile {
  /** Đường dẫn tương đối tính từ `<slug>/<num>/<sha>/`. */
  rel: string;
  name: string;
  kind: "video" | "image" | "json" | "other";
  size: number;
}

/* ── Phiên — đối tượng gốc của mô hình session-first (PRD 3.0) ─────────────
 * Đồng bộ tay với apps/runner: session.json do web ghi lúc mở phiên,
 * meta.json do session-run.sh và reaper.sh ghi (status/attempt/needs_human).
 */

export type SessionPhase = "interview" | "work";

/**
 * `starting` không nằm trên đĩa — nó là "session.json đã có mà meta.json
 * chưa": khoảnh khắc giữa lúc web ghi xong và lúc runner mở sổ. Vẽ nó ra
 * là cách duy nhất để nút vừa bấm không trông như không làm gì.
 */
export type SessionStatus = "starting" | "running" | "done" | "stopped" | "failed";

/** One evidence file of a session (V2.1), url served by /api/evidence. */
export interface BeeEvidenceFile {
  name: string;
  url: string;
  kind: "image" | "video" | "other";
}

export const SESSION_MODES = ["auto", "plan", "edits", "manual"] as const;
export type BeeSessionMode = (typeof SESSION_MODES)[number];

/**
 * Model per session (V2.7) — the aliases `claude --model` accepts, verified
 * against the CLI bundle (2.1.161). `default` means "send no --model flag":
 * the machine's own default answers, exactly like VSCode's "Default".
 * Full model ids (claude-fable-5…) are NOT in this list on purpose — an
 * alias always resolves to the latest, an id rots.
 */
export const SESSION_MODELS = [
  "default",
  "opus",
  "opus[1m]",
  "sonnet",
  "sonnet[1m]",
  "haiku",
] as const;
export type BeeSessionModel = (typeof SESSION_MODELS)[number];

export interface BeeSession {
  id: string;
  slug: string;
  num: number;
  repo: string;
  title: string | null;
  phase: SessionPhase;
  /** `false` = phiên chat: không worktree, không branch, không bao giờ có tool. */
  worktree: boolean;
  /**
   * Permission mode (V2.5a) — như menu mode của Claude Code trong VSCode:
   * auto = skip permissions (mặc định) · plan = chỉ đọc + trình kế hoạch ·
   * edits = sửa file tự do, bash bị từ chối. Manual chờ hook-reply (V2.5b).
   */
  mode?: BeeSessionMode;
  /** Model alias (V2.7); absent or "default" = the machine's own default. */
  model?: BeeSessionModel;
  status: SessionStatus;
  created_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  attempt: number;
  needs_human: boolean;
}

/**
 * Artifact một phiên đẻ ra trên GitHub — issue, PR. Ghi bởi skill bee-* vào
 * run.jsonl (dòng `bee_artifact`), đọc ra đây cho canvas và session list.
 */
export interface BeeArtifact {
  kind: "issue" | "pr";
  url: string;
  number: number | null;
  ts: string | null;
  /** Tiêu đề lúc tạo — skill ghi kèm. Trạng thái sống (merged/closed) là việc GitHub-side, V2. */
  title: string | null;
}

/** A registered repo — `repos.d/<slug>.env`, inside the PAT's scope, checked
 *  by doctor. Distinct from `BeeRepo` above, which is the reconciler-era
 *  shape and still carries queue/wip state. */
export interface BeeRegisteredRepo {
  slug: string;
  repo: string;
}

/** One line of the A+ hygiene checklist — written by apps/runner/bin/doctor.sh. */
export interface BeeDoctorCheck {
  id: string;
  ok: boolean;
  /** Human hint: what passed, or how to fix what failed. */
  detail: string;
}

/** How Claude is signed in on the machine — checked live, not via doctor. */
export type BeeClaudeAuth = "token" | "interactive" | "none";

/** One rate-limit window from the account-wide oauth usage endpoint. */
export interface BeeClaudeWindow {
  /** 0–100+, the ACCOUNT's utilization — not just this machine's share. */
  percent: number;
  resets_at: string | null;
}

/**
 * `state/claude-usage.json` — written by the refresh action from
 * api.anthropic.com/api/oauth/usage (the same source as Claude Code's
 * /usage screen). Account-wide, unlike the per-session harvest.
 */
export interface BeeClaudeAccountUsage {
  five_hour: BeeClaudeWindow | null;
  seven_day: BeeClaudeWindow | null;
  fetched_at: string;
}

/** Re-exported so BeeSource stays the single description of the disk surface.
    `import type` only — gc-fs is server-only, and a type import is erased. */
import type { BeeGc } from "./gc-fs";
export type { BeeGc, BeeGcItem } from "./gc-fs";

/** Shape of `doctor.json` — the machine's self-check for the setup screen. */
export interface BeeDoctor {
  checked_at: string;
  ok: boolean;
  /** PAUSE file exists — the machine intentionally takes no new sessions. */
  paused: boolean;
  checks: BeeDoctorCheck[];
}

/* ── Hàng đợi Autopilot (V3, FR-5.1) ───────────────────────────────────────
 * Hình dạng của `queue.json`. Ở lib/bee vì đây là hình dạng ĐĨA — feature
 * board đọc từ đây, không phải ngược lại (hạ tầng không phụ thuộc màn hình).
 */

export type ItemStatus = "waiting" | "running" | "done" | "failed";

export interface QueueItem {
  slug: string;
  repo: string;
  issue: number;
  mode: BeeSessionMode;
  model: BeeSessionModel;
  status: ItemStatus;
  /** Phiên đã mở cho việc này — link sang live view, và là bằng chứng đã chạy. */
  sessionId: string | null;
  /** Vì sao failed — bản tin sáng cần câu này, không phải mã lỗi. */
  reason: string | null;
  added_at: string;
}

export interface Queue {
  items: QueueItem[];
  /** ⏸ — hàng đợi vẫn nguyên, chỉ ngừng nhặt việc mới. */
  paused: boolean;
}

/** Toàn bộ đường ra vào `/srv/bee/`. Không module nào khác được chạm đĩa. */
export interface BeeSource {
  /** Repo đã đăng ký — nguồn DUY NHẤT của dropdown chọn repo. */
  listRepos(): Promise<BeeRegisteredRepo[]>;
  /** Mọi phiên trên máy, mới nhất trước. */
  listSessions(): Promise<BeeSession[]>;
  readSession(id: string): Promise<BeeSession | null>;
  /** Issue/PR phiên này đã tạo — quét dòng `bee_artifact` trong run.jsonl. */
  sessionArtifacts(id: string): Promise<BeeArtifact[]>;
  /** Evidence dir của MỘT phiên — canvas dùng để mọc node 🎬 demo. */
  listSessionEvidence(id: string): Promise<BeeEvidenceFile[]>;
  /** Evidence của phiên đã đẻ ra issue/PR này — `null` khi không phiên nào khớp. */
  findArtifactEvidence(
    repo: string,
    kind: "issue" | "pr",
    number: number,
  ): Promise<{ sessionId: string; files: BeeEvidenceFile[] } | null>;
  /** Câu cuối agent nói — preview một dòng cho node canvas. `null` khi chưa nói gì. */
  sessionPreview(id: string): Promise<string | null>;
  /**
   * Đường dẫn tuyệt đối tới `run.jsonl` của phiên — cho route SSE tail.
   * `null` khi id không hợp lệ. Đồng bộ vì chỉ là dựng đường dẫn; tồn tại
   * hay không là chuyện của người đọc file.
   */
  sessionRunPath(id: string): string | null;
  /** Latest doctor.json self-check; `null` = doctor has never run on this machine. */
  readDoctor(): Promise<BeeDoctor | null>;
  /** Latest gc.json; `null` = gc has never run. Kept reasons matter more than bytes. */
  readGc(): Promise<BeeGc | null>;
  /** Live Claude sign-in status — works even before doctor has ever run. */
  readClaudeAuth(): Promise<BeeClaudeAuth>;
  /** Account-wide usage windows from the last refresh; `null` = never fetched. */
  readClaudeUsage(): Promise<BeeClaudeAccountUsage | null>;
  /** Global slash commands (~/.claude/commands) — feeds the chat "/" palette. */
  listCommands(): Promise<{ name: string; hint: string }[]>;
  readStatus(): Promise<StatusRead>;
  readRecent(limit?: number): Promise<BeeRecentRun[]>;
  /**
   * `null` khi chưa từng có `rate_limit_event` nào — máy vừa cài, hoặc chưa lần
   * chạy nào chạm hạn mức. Đây là trạng thái *bình thường*, không phải lỗi, nên
   * nó nằm trong kiểu trả về chứ không ném ra ngoài.
   */
  readClaudeRateLimit(): Promise<BeeClaudeRateLimit | null>;
  /** `null` khi đường dẫn không hợp lệ hoặc file không tồn tại — cùng một câu trả lời. */
  readEvidenceFile(
    segments: string[],
  ): Promise<{ bytes: Uint8Array; contentType: string; etag: string } | null>;
}
