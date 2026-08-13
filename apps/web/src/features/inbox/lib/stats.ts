import type { Stat } from "@/components/stat-grid";
import { khoangThoiGian } from "@/lib/duration";

import type { InboxItem } from "./derive";

/**
 * Bốn con số đầu màn hình "Việc của bạn".
 *
 * Chọn theo câu hỏi người dùng thật sự hỏi khi mở app buổi sáng, không theo
 * "đếm được gì thì đếm": *có gì đang cháy không · tôi phải duyệt bao nhiêu ·
 * còn bao nhiêu chờ tôi cho phép · thứ lâu nhất đã chờ bao lâu.*
 */
export function thongKeViec(items: InboxItem[]): Stat[] {
  const dem = (...kinds: InboxItem["kind"][]) =>
    items.filter((i) => kinds.includes(i.kind)).length;

  const lauNhat = items.reduce((max, i) => Math.max(max, i.waitingS), 0);
  const canNguoi = dem("can-nguoi");

  return [
    {
      label: "Needs human",
      value: String(canNguoi),
      hint: canNguoi > 0 ? "agent stopped, waiting on you" : "nothing stuck",
      tone: canNguoi > 0 ? "down" : undefined,
    },
    {
      label: "Awaiting your review",
      value: String(dem("duyet-pr", "duyet-spec")),
      hint: "specs and pull requests",
    },
    {
      label: "Awaiting your go-ahead",
      value: String(dem("cho-phep-nhan-task", "agent-hoi-nguoc")),
      hint: "allow pick-up, or reply to the agent",
    },
    {
      label: "Longest wait",
      value: items.length === 0 ? "—" : khoangThoiGian(lauNhat),
      hint: items.length === 0 ? "inbox empty" : `out of ${items.length} items`,
      tone: lauNhat > 24 * 3600 ? "warn" : undefined,
    },
  ];
}
