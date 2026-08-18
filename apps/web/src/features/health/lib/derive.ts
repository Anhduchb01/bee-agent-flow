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
  running: number;
  pausedRepos: string[];
  /** Số repo bị bỏ vì hình dạng hỏng — hiện ra chứ không giấu. */
  dropped: number;
}

/** Phần "chưa biết gì" của Health, dùng cho mọi kết cục không đọc được file. */
const NOTHING: Omit<Health, "level" | "headline" | "detail"> = {
  heartbeatAgeS: null,
  running: 0,
  pausedRepos: [],
  dropped: 0,
};

/**
 * Biến kết quả đọc `status.json` thành một câu nói được ra màn hình.
 *
 * Ba trong bốn kết cục ở đây **không phải lỗi lập trình**: file chưa có (vừa
 * cài), file hỏng (đang ghi dở), file cũ (runner chết). Cái thứ ba là chế độ
 * hỏng nguy hiểm nhất của cả hệ thống — không có gì đỏ để nhìn, chỉ là không
 * có gì xảy ra — nên nó phải là thứ to nhất trên màn hình khi xảy ra.
 */
export function deriveHealth(read: StatusRead, now: Date = new Date()): Health {
  if (!read.ok) {
    if (read.reason === "missing") {
      return {
        ...NOTHING,
        level: "warn",
        headline: "No data from the runner yet",
        detail:
          "status.json not found. Normal right after install, before the runner has run a tick.",
      };
    }
    return {
      ...NOTHING,
      level: "down",
      headline: "Cannot read system status",
      detail: `${read.reason === "malformed" ? "status.json is malformed" : "cannot open status.json"} · ${read.detail}`,
    };
  }

  const { status, dropped } = read;
  const ageS = heartbeatAge(status.heartbeat, now);
  const pausedRepos = status.repos.filter((r) => r.paused).map((r) => r.slug);

  const shared = {
    heartbeatAgeS: ageS,
    running: status.running.length,
    pausedRepos,
    dropped,
  };

  if (isHeartbeatStale(status.heartbeat, now)) {
    return {
      ...shared,
      level: "down",
      headline: "The runner may be dead",
      detail:
        ageS === null
          ? "Heartbeat is unreadable — every number below is from the last write, not from now."
          : `Last tick was ${Math.round(ageS / 60)} minutes ago, past the ${STALE_AFTER_S / 60}-minute threshold. Every number below is stale.`,
    };
  }

  if (status.mode === "paused") {
    return {
      ...shared,
      level: "warn",
      headline: "The whole system is paused",
      detail: "Kill switch is on — the runner is alive but hands out no work.",
    };
  }

  if (pausedRepos.length > 0) {
    return {
      ...shared,
      level: "warn",
      headline: `${pausedRepos.length} project(s) paused`,
      detail: `${pausedRepos.join(", ")} — .agent/PAUSE is present on the default branch.`,
    };
  }

  return {
    ...shared,
    level: "ok",
    headline: "System is running",
    detail:
      status.repos.length === 0
        ? "No projects yet. Add one with `be repo add <org/repo>` on the agent machine."
        : `${status.repos.length} project(s) · last tick ${ageS ?? 0}s ago.`,
  };
}
