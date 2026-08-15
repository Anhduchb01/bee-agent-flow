import type { GhTask } from "@/lib/github/types";
import { STAGE_LABEL, stageOf } from "@/lib/task-stage";

/**
 * Ảnh chụp trạng thái dự án, ghép vào tin nhắn đầu tiên của ô chat.
 *
 * Đây là TOÀN BỘ những gì model biết — nó không có tool, không đọc repo, không
 * gọi GitHub. Nên hình dạng ở đây quyết định thẳng chất lượng câu trả lời, và
 * `prompts/project-chat.md` nói rõ với nó rằng ngoài khối này thì không biết gì
 * thêm, đừng suy ra.
 *
 * Cắt ở 40 task: một dự án lớn hơn thế thì phần đuôi hiếm khi là thứ người ta
 * đang hỏi, và cả ảnh chụp phải vừa một lượt chat.
 */
const TRAN = 40;

function tuoi(iso: string, now: Date): string {
  const gio = Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (!Number.isFinite(gio) || gio < 0) return "không rõ";
  if (gio < 1) return "dưới 1 giờ";
  if (gio < 48) return `${gio} giờ`;
  return `${Math.floor(gio / 24)} ngày`;
}

export function anhChupDuAn(slug: string, tasks: GhTask[], now: Date): string {
  const mo = tasks.filter((t) => t.state === "open");
  const dong = tasks.length - mo.length;

  const dong_ke = mo.slice(0, TRAN).map((t) => {
    const bo: string[] = [
      `#${t.number}`,
      STAGE_LABEL[stageOf(t)],
      t.title,
      `đứng yên ${tuoi(t.updated_at, now)}`,
    ];
    if (t.pull) {
      const do_ = t.pull.checks.filter((c) => c.conclusion === "failure").map((c) => c.name);
      bo.push(
        `PR #${t.pull.number}${t.pull.draft ? " (draft)" : ""}`,
        `${t.pull.reviews.filter((r) => r.state === "APPROVED").length} approve`,
      );
      if (do_.length > 0) bo.push(`check đỏ: ${do_.join(", ")}`);
    }
    if (t.labels.includes("needs-human")) bo.push("ĐANG XIN NGƯỜI");
    return `- ${bo.join(" · ")}`;
  });

  return [
    "<snapshot>",
    `Dự án: ${slug}`,
    `Chụp lúc: ${now.toISOString()}`,
    `${mo.length} task đang mở, ${dong} đã đóng.`,
    mo.length > TRAN ? `(chỉ liệt kê ${TRAN} task đầu)` : "",
    "",
    ...dong_ke,
    "</snapshot>",
  ]
    .filter(Boolean)
    .join("\n");
}
