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

/** Toàn bộ đường ra vào `/srv/bee/`. Không module nào khác được chạm đĩa. */
export interface BeeSource {
  readStatus(): Promise<StatusRead>;
  readRecent(limit?: number): Promise<BeeRecentRun[]>;
  listEvidence(slug: string, num: number): Promise<EvidenceRun[]>;
  /** `null` khi đường dẫn không hợp lệ hoặc file không tồn tại — cùng một câu trả lời. */
  readEvidenceFile(
    segments: string[],
  ): Promise<{ bytes: Uint8Array; contentType: string } | null>;
}
