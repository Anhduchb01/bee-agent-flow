// Import thẳng vào hai module không chạm đĩa, không qua barrel `@/lib/bee`:
// barrel kéo theo `server-only` và `node:fs`, mà hàm dưới đây là hàm thuần và
// phải chạy được ở cả hai phía.
import { heartbeatAge, isHeartbeatStale, STALE_AFTER_S } from "@/lib/bee/heartbeat";
import type { StatusRead } from "@/lib/bee/types";

export type HealthLevel = "ok" | "warn" | "down";

export interface Health {
  level: HealthLevel;
  headline: string;
  detail: string;
  /** `null` khi không đọc được `status.json` hoặc heartbeat không phải ngày tháng. */
  heartbeatAgeS: number | null;
  slots: {
    build: { used: number; max: number };
    evidence: { used: number; max: number };
  } | null;
  running: number;
  queued: number;
  pausedRepos: string[];
  /** Số repo bị bỏ vì hình dạng hỏng — hiện ra chứ không giấu. */
  dropped: number;
}

/** Phần "chưa biết gì" của Health, dùng cho mọi kết cục không đọc được file. */
const NOTHING: Omit<Health, "level" | "headline" | "detail"> = {
  heartbeatAgeS: null,
  slots: null,
  running: 0,
  queued: 0,
  pausedRepos: [],
  dropped: 0,
};

/**
 * Biến kết quả đọc `status.json` thành một câu nói được ra màn hình.
 *
 * Ba trong bốn kết cục ở đây **không phải lỗi lập trình**: file chưa có (vừa
 * cài), file hỏng (đang ghi dở), file cũ (reconciler chết). Cái thứ ba là chế
 * độ hỏng nguy hiểm nhất của cả hệ thống — không có gì đỏ để nhìn, chỉ là không
 * có gì xảy ra — nên nó phải là thứ to nhất trên màn hình khi xảy ra.
 */
export function deriveHealth(read: StatusRead, now: Date = new Date()): Health {
  if (!read.ok) {
    if (read.reason === "missing") {
      return {
        ...NOTHING,
        level: "warn",
        headline: "Chưa có dữ liệu từ reconciler",
        detail:
          "Không tìm thấy status.json. Bình thường ngay sau khi cài, khi reconciler chưa chạy tick nào.",
      };
    }
    return {
      ...NOTHING,
      level: "down",
      headline: "Không đọc được trạng thái hệ thống",
      detail: `${read.reason === "malformed" ? "status.json sai định dạng" : "không mở được status.json"} · ${read.detail}`,
    };
  }

  const { status, dropped } = read;
  const ageS = heartbeatAge(status.heartbeat, now);
  const pausedRepos = status.repos.filter((r) => r.paused).map((r) => r.slug);
  const queued = status.repos.reduce((n, r) => n + r.queue.length, 0);

  const shared = {
    heartbeatAgeS: ageS,
    slots: {
      build: { used: status.slots.build.used, max: status.slots.build.max },
      evidence: { used: status.slots.evidence.used, max: status.slots.evidence.max },
    },
    running: status.running.length,
    queued,
    pausedRepos,
    dropped,
  };

  if (isHeartbeatStale(status.heartbeat, now)) {
    return {
      ...shared,
      level: "down",
      headline: "Reconciler có thể đã chết",
      detail:
        ageS === null
          ? "Heartbeat không đọc được — mọi con số dưới đây là của lần ghi cuối, không phải hiện tại."
          : `Tick gần nhất cách đây ${Math.round(ageS / 60)} phút, quá ngưỡng ${STALE_AFTER_S / 60} phút. Mọi con số dưới đây là cũ.`,
    };
  }

  if (status.mode === "paused") {
    return {
      ...shared,
      level: "warn",
      headline: "Toàn hệ thống đang tạm dừng",
      detail: "Kill switch đang bật — reconciler vẫn sống nhưng không giao việc nào.",
    };
  }

  if (pausedRepos.length > 0) {
    return {
      ...shared,
      level: "warn",
      headline: `${pausedRepos.length} dự án đang tạm dừng`,
      detail: `${pausedRepos.join(", ")} — có .agent/PAUSE trên nhánh mặc định.`,
    };
  }

  return {
    ...shared,
    level: "ok",
    headline: "Hệ thống đang chạy",
    detail:
      status.repos.length === 0
        ? "Chưa có dự án nào. Thêm bằng `be repo add <org/repo>` trên máy agent."
        : `${status.repos.length} dự án · tick gần nhất ${ageS ?? 0}s trước.`,
  };
}
