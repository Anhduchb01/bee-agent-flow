import { STAGE_LABEL, STAGES, stageOf, type Stage } from "@/lib/task-stage";
import type { GhTask } from "@/lib/github/types";

export interface PhanKhuc {
  stage: Stage;
  label: string;
  so: number;
}

export interface HonHopDuAn {
  slug: string;
  full: string;
  tong: number;
  khuc: PhanKhuc[];
}

/**
 * Phân bố task theo giai đoạn, cho mỗi dự án.
 *
 * Đây là thứ thay cho cột "tổng số task". Một dự án 2 task mà một nửa kẹt ở
 * "cần người" và một dự án 8 task đang chạy ngon là hai tình huống đòi hai hành
 * động khác nhau, mà một con số tổng thì không phân biệt được.
 *
 * `khuc` **chỉ chứa giai đoạn có task** — thanh vẽ ra không nên có đoạn dài 0px,
 * và chú giải không nên liệt kê những dòng "0 cần người". Ngược lại với bảng
 * kanban, nơi cột rỗng phải giữ để bố cục không đổi hình mỗi lần mở.
 */
export function honHopDuAn(
  duAn: { slug: string; full: string; tasks: GhTask[] }[],
): HonHopDuAn[] {
  return duAn.map((p) => {
    const mo = p.tasks.filter((t) => t.state === "open");
    const dem = new Map<Stage, number>();
    for (const t of mo) {
      const s = stageOf(t);
      dem.set(s, (dem.get(s) ?? 0) + 1);
    }

    return {
      slug: p.slug,
      full: p.full,
      tong: mo.length,
      khuc: STAGES.filter((s) => (dem.get(s) ?? 0) > 0).map((s) => ({
        stage: s,
        label: STAGE_LABEL[s],
        so: dem.get(s)!,
      })),
    };
  });
}
