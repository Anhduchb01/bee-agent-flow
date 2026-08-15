/**
 * Bóc khối ```task mà người phỏng vấn phát ra thành thứ `taoTask` nhận.
 *
 * Đây là chỗ hai bên gặp nhau: `prompts/spec-chat.md` bảo model in ra hình dạng
 * này, còn hàm dưới đây đọc nó. Hai file, hai ngôn ngữ, đồng bộ bằng tay — nên
 * hàm này KHÔNG được đoán. Thiếu mục nào thì nói ra mục đó, đừng lấp bằng chuỗi
 * rỗng: một Acceptance Criteria rỗng vẫn tạo được issue, và nó là hợp đồng rỗng
 * mà rule 08 sẽ trả lại sau khi đã tốn một vòng.
 */

export interface KhoiTask {
  title: string;
  goal: string;
  acceptance: string;
  constraints: string;
  out_of_scope: string;
  ui_reference: string;
}

export type KetQuaBoc =
  | { ok: true; task: KhoiTask }
  | { ok: false; thieu: string[] };

/** Tên mục phải khớp TỪNG CHỮ với `prompts/spec.md` và `task-form.ts`. */
const MUC = [
  ["goal", "Goal"],
  ["acceptance", "Acceptance Criteria"],
  ["constraints", "Technical constraints"],
  ["out_of_scope", "Out of scope"],
  ["ui_reference", "UI Reference"],
] as const;

/**
 * Lấy khối ```task CUỐI CÙNG trong cả đoạn hội thoại.
 *
 * Cuối cùng chứ không phải đầu tiên: người dùng xin sửa thì model in ra một
 * khối mới trọn vẹn (prompt cấm nó in diff), nên khối mới nhất mới là bản đang
 * bàn. Lấy khối đầu là âm thầm tạo task theo bản đã bị bác bỏ.
 */
export function timKhoiTask(text: string): string | null {
  const re = /```task\s*\n([\s\S]*?)```/g;
  let cuoi: string | null = null;
  for (const m of text.matchAll(re)) cuoi = m[1];
  return cuoi;
}

export function bocKhoiTask(raw: string): KetQuaBoc {
  // Tiêu đề: dòng `# …` đầu tiên. Model đôi khi bỏ nó và mở thẳng bằng `###`,
  // nên phải phân biệt `#` với `###` — `^#\s` chứ không phải `^#`.
  const title = /^#[ \t]+(.+)$/m.exec(raw)?.[1]?.trim() ?? "";

  /*
   * Quét từng dòng thay vì một regex cho mỗi mục.
   *
   * Bản trước dùng `(?=^###|\z)` để cắt tới tiêu đề kế hoặc hết chuỗi — nhưng
   * `\z` là cú pháp Ruby/PCRE, JavaScript không có. Trong JS nó thành "chữ z",
   * nên MỤC CUỐI không bao giờ khớp và luôn bị báo thiếu. Bốn mục đầu vẫn đúng,
   * nên lỗi trông như "model quên mục cuối" chứ không như một lỗi regex.
   *
   * Quét dòng cũng không phụ thuộc thứ tự các mục, và model thì có đảo thật.
   */
  const theoNhan = new Map(MUC.map(([key, nhan]) => [nhan.toLowerCase(), key]));
  const noiDung: Record<string, string> = {};
  let dangO: string | null = null;
  let dem: string[] = [];

  const chot = () => {
    if (dangO) noiDung[dangO] = dem.join("\n").trim();
    dem = [];
  };

  for (const dong of raw.split(/\r?\n/)) {
    const tieuDe = /^###[ \t]+(.+?)[ \t]*$/.exec(dong);
    if (tieuDe) {
      chot();
      dangO = theoNhan.get(tieuDe[1].toLowerCase()) ?? null;
      continue;
    }
    if (dangO) dem.push(dong);
  }
  chot();

  const thieu: string[] = [];
  if (!title) thieu.push("Title");
  for (const [key, nhan] of MUC) if (!noiDung[key]) thieu.push(nhan);
  if (thieu.length > 0) return { ok: false, thieu };

  return {
    ok: true,
    task: {
      title,
      goal: noiDung.goal,
      acceptance: noiDung.acceptance,
      constraints: noiDung.constraints,
      out_of_scope: noiDung.out_of_scope,
      ui_reference: noiDung.ui_reference,
    },
  };
}
