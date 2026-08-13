/**
 * Tách body issue thành năm mục của hợp đồng.
 *
 * Body do người gõ hoặc do form sinh ra, nên nó **không** đảm bảo đúng hình
 * dạng — issue tạo tay trên GitHub, issue từ thời trước khi có template, issue
 * agent viết lại. Hàm này vì vậy không bao giờ ném lỗi: phần không nhận ra
 * được giữ nguyên và hiện ra dưới dạng văn bản, chứ không biến mất.
 */
export const MUC = [
  "Goal",
  "Acceptance Criteria",
  "Technical constraints",
  "Out of scope",
  "UI Reference",
] as const;

export type TenMuc = (typeof MUC)[number];

export interface TieuChi {
  text: string;
  done: boolean;
}

export interface BodyTask {
  /** Văn bản đứng trước mục đầu tiên. Rỗng với issue đúng hợp đồng. */
  preamble: string;
  sections: { heading: string; body: string; known: boolean }[];
  /** Rút riêng từ mục Acceptance Criteria, dạng checkbox. */
  acceptance: TieuChi[];
  /** Mục bắt buộc còn thiếu — hiện ra chứ không im lặng. */
  missing: TenMuc[];
}

const HEADING = /^#{2,4}\s+(.+?)\s*$/;
const CHECKBOX = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;

export function parseTaskBody(body: string): BodyTask {
  const lines = (body ?? "").replace(/\r\n/g, "\n").split("\n");

  const sections: BodyTask["sections"] = [];
  const preamble: string[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    sections.push({
      heading: current.heading,
      body: current.lines.join("\n").trim(),
      known: (MUC as readonly string[]).includes(current.heading),
    });
    current = null;
  };

  for (const line of lines) {
    const m = HEADING.exec(line);
    if (m) {
      flush();
      current = { heading: m[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  flush();

  const ac = sections.find((s) => s.heading === "Acceptance Criteria");
  const acceptance: TieuChi[] = (ac?.body ?? "")
    .split("\n")
    .map((l) => CHECKBOX.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ text: m[2].trim(), done: m[1].toLowerCase() === "x" }));

  const have = new Set(sections.map((s) => s.heading));
  const missing = MUC.filter((m) => !have.has(m));

  return { preamble: preamble.join("\n").trim(), sections, acceptance, missing };
}
