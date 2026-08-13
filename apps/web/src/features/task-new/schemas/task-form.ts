import { z } from "zod";

/**
 * Hợp đồng của `.github/ISSUE_TEMPLATE/task.yml` — **cả năm mục đều bắt buộc**.
 *
 * Mục tiêu là làm form này *dễ điền hơn* form GitHub, không phải *lỏng hơn*.
 * Hợp đồng thiếu là gốc của mọi task build lệch: spec gatekeeper sẽ hỏi ngược
 * và task nằm chờ thêm một vòng, nên bắt ở đây rẻ hơn nhiều.
 *
 * Tên năm mục phải khớp **từng chữ** với bảng trong `prompts/spec.md` của
 * reconciler — chúng là cùng một hợp đồng đọc từ hai phía.
 */
const batBuoc = (nhan: string, min = 1) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${nhan} is required.` : `${nhan} needs at least ${min} characters.`);

export const taskFormSchema = z.object({
  slug: batBuoc("Project"),
  title: batBuoc("Title", 8),
  goal: batBuoc("Goal", 15),
  acceptance: batBuoc("Acceptance Criteria", 15).refine(
    (v) => /(^|\n)\s*[-*]\s*\[( |x|X)\]\s*\S/.test(v),
    "One checkbox per criterion, as `- [ ] Given …, When …, Then …`.",
  ),
  constraints: batBuoc("Technical constraints"),
  out_of_scope: batBuoc("Out of scope"),
  ui_reference: batBuoc("UI Reference"),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const TRUONG: { name: keyof TaskFormValues; label: string; hint: string; rows?: number }[] = [
  {
    name: "goal",
    label: "Goal",
    hint: "One sentence, from the user's point of view. This is what the agent falls back on when it has to choose between two approaches.",
    rows: 2,
  },
  {
    name: "acceptance",
    label: "Acceptance Criteria",
    hint: "Given/When/Then, one checkbox per criterion. These become test cases and E2E file names — so they must be verifiable. Avoid “reasonable”, “smooth”, “fast”.",
    rows: 5,
  },
  {
    name: "constraints",
    label: "Technical constraints",
    hint: "Files/modules in play, API contracts that must hold, libraries required or forbidden.",
    rows: 3,
  },
  {
    name: "out_of_scope",
    label: "Out of scope",
    hint: "As important as the AC — this is what stops the agent from creeping. Include the things that “look like they should be done while we're here”.",
    rows: 3,
  },
  {
    name: "ui_reference",
    label: "UI Reference",
    hint: "A Figma link, a screenshot, or a description. If the task has no UI, say “no UI” explicitly.",
    rows: 2,
  },
];
