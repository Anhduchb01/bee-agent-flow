import { z } from "zod";

/**
 * Hợp đồng của `.github/ISSUE_TEMPLATE/task.yml` — **cả năm mục đều bắt buộc**.
 *
 * Mục tiêu là làm form này *dễ điền hơn* form GitHub, không phải *lỏng hơn*.
 * Hợp đồng thiếu là gốc của mọi task build lệch: spec gatekeeper sẽ hỏi ngược
 * và task nằm chờ thêm một vòng, nên bắt ở đây rẻ hơn nhiều.
 */
const batBuoc = (nhan: string, min = 1) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${nhan} không được để trống.` : `${nhan} cần ít nhất ${min} ký tự.`);

export const taskFormSchema = z.object({
  slug: batBuoc("Dự án"),
  title: batBuoc("Tiêu đề", 8),
  goal: batBuoc("Mục tiêu", 15),
  acceptance: batBuoc("Acceptance Criteria", 15).refine(
    (v) => /(^|\n)\s*[-*]\s*\[( |x|X)\]\s*\S/.test(v),
    "Mỗi tiêu chí một checkbox, dạng `- [ ] Given …, When …, Then …`.",
  ),
  constraints: batBuoc("Ràng buộc kỹ thuật"),
  out_of_scope: batBuoc("Out of scope"),
  ui_reference: batBuoc("UI Reference"),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const TRUONG: { name: keyof TaskFormValues; label: string; hint: string; rows?: number }[] = [
  {
    name: "goal",
    label: "Mục tiêu",
    hint: "Một câu, nhìn từ phía người dùng. Đây là thứ agent bám vào khi phải chọn giữa hai cách làm.",
    rows: 2,
  },
  {
    name: "acceptance",
    label: "Acceptance Criteria",
    hint: "Given/When/Then, mỗi tiêu chí một checkbox. Đây sẽ thành test case và tên file E2E — nên phải kiểm chứng được. Tránh “hợp lý”, “mượt”, “nhanh”.",
    rows: 5,
  },
  {
    name: "constraints",
    label: "Ràng buộc kỹ thuật",
    hint: "File/module được phép đụng, API contract phải giữ nguyên, thư viện bắt buộc hoặc bị cấm.",
    rows: 3,
  },
  {
    name: "out_of_scope",
    label: "Out of scope",
    hint: "Quan trọng ngang AC — đây là thứ chặn agent nở scope. Ghi cả những thứ “trông có vẻ nên làm luôn”.",
    rows: 3,
  },
  {
    name: "ui_reference",
    label: "UI Reference",
    hint: "Link Figma, screenshot, hoặc mô tả. Task không có UI thì ghi rõ “không có UI”.",
    rows: 2,
  },
];
