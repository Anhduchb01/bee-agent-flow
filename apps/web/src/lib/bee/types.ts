/**
 * Hình dạng của những gì reconciler ghi ra đĩa.
 *
 * ĐỒNG BỘ TAY với `apps/reconciler/`. Đổi một bên thì đổi bên kia trong cùng
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

export interface BeeStatus {
  heartbeat: string;
  mode: BeeMode;
  slots: BeeSlots;
  running: BeeRunning[];
  repos: BeeRepo[];
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

/**
 * Một lần agent chạy, đã được `run_archive` giữ lại.
 *
 * Khác `BeeRecentRun` ở chỗ: bản ghi kia là một DÒNG trong `recent.jsonl` (giữ
 * 200 dòng cuối cho cả máy), còn cái này là một THƯ MỤC gắn với đúng một task
 * và sống tới khi task đóng. Cùng dữ liệu ở phần đầu, khác vòng đời.
 */
export interface BeeRun {
  /** Tên thư mục — khoá để đọc chi tiết. `<id>-<lúc ISO gọn>`. */
  dir: string;
  id: string;
  repo: string;
  number: number;
  rule: string;
  result: string;
  at: string;
  turns: number;
  duration_s: number;
  /** Tên phiên Claude, để nối lại hội thoại. `null` khi rule không gọi agent. */
  session_id: string | null;
}

/** Một bước trong lần chạy. `cat` = ghi chú của chính bee, không phải của agent. */
export interface BeeRunStep {
  kind: "noi" | "tool" | "cat";
  text: string;
}

export interface BeeRunDetail extends BeeRun {
  /** Báo cáo cuối cùng — đúng thứ được đăng lên issue. */
  output: string;
  steps: BeeRunStep[];
  usage: {
    tokens_in?: number;
    tokens_out?: number;
    tokens_cache_read?: number;
    tokens_cache_write?: number;
    cost_usd?: number;
    stop_reason?: string | null;
    api_error_status?: number | null;
  } | null;
}

export interface EvidenceFile {
  /** Đường dẫn tương đối tính từ `<slug>/<num>/<sha>/`. */
  rel: string;
  name: string;
  kind: "video" | "image" | "json" | "other";
  size: number;
}

export interface EvidenceRun {
  slug: string;
  number: number;
  sha: string;
  files: EvidenceFile[];
}

/* ── Phiên — đối tượng gốc của mô hình session-first (PRD 3.0) ─────────────
 * Đồng bộ tay với apps/runner: session.json do web ghi lúc mở phiên,
 * meta.json do session-run.sh và reaper.sh ghi (status/attempt/needs_human).
 */

export type PhaCuaPhien = "interview" | "work";

/**
 * `starting` không nằm trên đĩa — nó là "session.json đã có mà meta.json
 * chưa": khoảnh khắc giữa lúc web ghi xong và lúc runner mở sổ. Vẽ nó ra
 * là cách duy nhất để nút vừa bấm không trông như không làm gì.
 */
export type TrangThaiPhien = "starting" | "running" | "done" | "stopped" | "failed";

export interface BeeSession {
  id: string;
  slug: string;
  num: number;
  repo: string;
  title: string | null;
  phase: PhaCuaPhien;
  /** `false` = phiên chat: không worktree, không branch, không bao giờ có tool. */
  worktree: boolean;
  status: TrangThaiPhien;
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

/** Một repo đã đăng ký — `repos.d/<slug>.env`, trong phạm vi PAT, doctor kiểm được. */
export interface BeeRepoDangKy {
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

/** Shape of `doctor.json` — the machine's self-check for the setup screen. */
export interface BeeDoctor {
  checked_at: string;
  ok: boolean;
  /** PAUSE file exists — the machine intentionally takes no new sessions. */
  paused: boolean;
  checks: BeeDoctorCheck[];
}

/** Toàn bộ đường ra vào `/srv/bee/`. Không module nào khác được chạm đĩa. */
export interface BeeSource {
  /** Repo đã đăng ký — nguồn DUY NHẤT của dropdown chọn repo. */
  listRepos(): Promise<BeeRepoDangKy[]>;
  /** Mọi phiên trên máy, mới nhất trước. */
  listSessions(): Promise<BeeSession[]>;
  readSession(id: string): Promise<BeeSession | null>;
  /** Issue/PR phiên này đã tạo — quét dòng `bee_artifact` trong run.jsonl. */
  sessionArtifacts(id: string): Promise<BeeArtifact[]>;
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
  readStatus(): Promise<StatusRead>;
  readRecent(limit?: number): Promise<BeeRecentRun[]>;
  /**
   * `null` khi chưa từng có `rate_limit_event` nào — máy vừa cài, hoặc chưa lần
   * chạy nào chạm hạn mức. Đây là trạng thái *bình thường*, không phải lỗi, nên
   * nó nằm trong kiểu trả về chứ không ném ra ngoài.
   */
  readClaudeRateLimit(): Promise<BeeClaudeRateLimit | null>;
  /** Các lần agent đã chạy cho task này, mới nhất trước. */
  listRuns(slug: string, num: number): Promise<BeeRun[]>;
  readRun(slug: string, num: number, dir: string): Promise<BeeRunDetail | null>;
  listEvidence(slug: string, num: number): Promise<EvidenceRun[]>;
  /** `null` khi đường dẫn không hợp lệ hoặc file không tồn tại — cùng một câu trả lời. */
  readEvidenceFile(
    segments: string[],
  ): Promise<{ bytes: Uint8Array; contentType: string } | null>;
}
