import type { BeeArtifact, BeeSession, Queue, QueueItem } from "@/lib/bee/types";

/**
 * Bản tin buổi sáng (FR-5.3) — thuần, không I/O.
 *
 * PRD đòi "chạy gì, xong gì, kẹt gì, **vì sao** — câu đọc được, không phải mã
 * lỗi". Nên mỗi việc kẹt bắt buộc mang một câu; không có `reason` thì suy từ
 * trạng thái chứ không để trống.
 *
 * Và §4.1: **rỗng-vì-hết-việc ≠ rỗng-vì-lỗi**. Ba loại đêm khác hẳn nhau —
 * không xếp việc gì · có xếp mà không chạy được · có chạy — nên `loai` là một
 * trường riêng, không bắt màn hình đoán từ mấy mảng rỗng.
 */

export type DigestKind = "khong-xep-viec" | "xep-ma-khong-chay" | "co-viec";

export interface RanItem {
  session: BeeSession;
  pr: BeeArtifact | null;
  issue: BeeArtifact | null;
}

export interface StuckItem {
  session: BeeSession;
  why: string;
}

export interface WaitingItem {
  item: QueueItem;
  why: string;
}

export interface Digest {
  loai: DigestKind;
  since: string;
  den: string;
  ran: RanItem[];
  toReview: RanItem[];
  ket: StuckItem[];
  stillQueued: WaitingItem[];
}

/** Không có `reason` thì trạng thái vẫn phải dịch ra được tiếng người. */
function whyStuck(p: BeeSession): string {
  const reason = (p as unknown as Record<string, unknown>).reason;
  if (typeof reason === "string" && reason !== "") return reason;
  if (p.needs_human) return "needs a human — the session failed twice in a row";
  if (p.status === "failed") return "the session ended with an error — open it to read the event stream";
  if (p.status === "stopped") return "stopped part-way";
  return "no reason recorded — open the session and read its event stream";
}

function inWindow(p: BeeSession, since: Date, den: Date): boolean {
  const moc = p.ended_at ?? p.started_at ?? p.created_at;
  if (moc === null) return false;
  const t = new Date(moc).getTime();
  return Number.isFinite(t) && t >= since.getTime() && t <= den.getTime();
}

export function buildDigest(input: {
  session: BeeSession[];
  artifacts: Record<string, BeeArtifact[]>;
  queue: Queue;
  since: Date;
  den: Date;
}): Digest {
  const within = input.session.filter((p) => inWindow(p, input.since, input.den));

  const ran: RanItem[] = within.map((p) => {
    const owner = input.artifacts[p.id] ?? [];
    return {
      session: p,
      pr: owner.find((a) => a.kind === "pr") ?? null,
      issue: owner.find((a) => a.kind === "issue") ?? null,
    };
  });

  // "Chờ duyệt" là phiên xong VÀ có PR. Xong-mà-không-PR là chuyện khác hẳn —
  // trộn hai thứ lại là hứa với người dùng một cái PR không tồn tại.
  const toReview = ran.filter((m) => m.session.status === "done" && m.pr !== null);

  const ket: StuckItem[] = within
    .filter((p) => p.needs_human || p.status === "failed" || p.status === "stopped")
    .map((p) => ({ session: p, why: whyStuck(p) }));

  const stillQueued: WaitingItem[] = input.queue.items
    .filter((v) => v.status === "waiting")
    .map((v) => ({
      item: v,
      why: v.reason ?? "not its turn yet",
    }));

  const loai: DigestKind =
    within.length > 0
      ? "co-viec"
      : input.queue.items.length > 0
        ? "xep-ma-khong-chay"
        : "khong-xep-viec";

  return {
    loai,
    since: input.since.toISOString(),
    den: input.den.toISOString(),
    ran,
    toReview,
    ket,
    stillQueued,
  };
}
