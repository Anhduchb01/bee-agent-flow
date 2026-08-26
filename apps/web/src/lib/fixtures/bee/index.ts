/**
 * Năm cảnh dữ liệu, lấy nguyên từ `apps/reconciler/public/make-mockup.py` —
 * cùng bộ cảnh mà mockup dashboard đã qua một vòng người xem.
 *
 * Mốc thời gian ghi dạng `__AGO_n__` (n giây trước) thay vì một ISO cố định.
 * Cảnh "reconciler-chet" chỉ có nghĩa khi heartbeat *luôn* cũ 34 phút; một mốc
 * cứng sẽ đúng hôm nay và sai vào ngày mai — mà đó lại là cảnh quan trọng nhất.
 */
import binhThuong from "./binh-thuong.json";
import coSuCo from "./co-su-co.json";
import heavyLoad from "./day-tai.json";
import reconcilerChet from "./reconciler-chet.json";
import vuaCai from "./vua-cai.json";

export const SCENE_IDS = [
  "binh-thuong",
  "day-tai",
  "co-su-co",
  "reconciler-chet",
  "vua-cai",
] as const;

export type SceneId = (typeof SCENE_IDS)[number];

export const SCENE_LABELS: Record<SceneId, string> = {
  "binh-thuong": "Normal",
  "day-tai": "Under load",
  "co-su-co": "Something wrong",
  "reconciler-chet": "Reconciler dead",
  "vua-cai": "Freshly installed",
};

const SCENES: Record<SceneId, unknown> = {
  "binh-thuong": binhThuong,
  "day-tai": heavyLoad,
  "co-su-co": coSuCo,
  "reconciler-chet": reconcilerChet,
  "vua-cai": vuaCai,
};

export function isSceneId(value: string | undefined): value is SceneId {
  return SCENE_IDS.includes(value as SceneId);
}

const AGO = /"__AGO_(\d+)__"/g;

/** Trả về đúng phần văn bản mà `disk.ts` sẽ đọc được từ `status.json`. */
export function sceneJson(id: SceneId, now: Date = new Date()): string {
  return JSON.stringify(SCENES[id]).replace(AGO, (_m, sec: string) =>
    JSON.stringify(new Date(now.getTime() - Number(sec) * 1000).toISOString()),
  );
}

/**
 * Bảy ngày lịch sử chạy, sinh theo công thức cố định (không dùng random — hai
 * lần mở trang phải cho cùng một biểu đồ, nếu không thì không ai tin nó).
 *
 * Hình dạng cố ý: cuối tuần gần như im, hôm nay tỉ lệ đỏ cao hẳn. Đó là cảnh
 * khiến khối "Bảy ngày qua" có lý do tồn tại — nó phải nói được "máy đang tệ
 * đi", chứ không phải vẽ bảy cột đều nhau.
 */
const MAU_NGAY: { finished: number; err: number }[] = [
  { finished: 6, err: 0 }, // 6 ngày trước
  { finished: 10, err: 1 },
  { finished: 3, err: 0 }, // cuối tuần
  { finished: 1, err: 0 },
  { finished: 13, err: 1 },
  { finished: 12, err: 0 },
  { finished: 7, err: 6 }, // hôm nay
];

const RULE = ["07-build", "04-evidence", "03-run-ci", "08-spec", "02-review-feedback"];
const REPO = ["myapp", "shop", "blog"];

export function recentRunsJson(now: Date = new Date()): string[] {
  const out: string[] = [];
  let n = 0;

  MAU_NGAY.forEach((ngay, i) => {
    const luiNgay = MAU_NGAY.length - 1 - i;
    for (let k = 0; k < ngay.finished + ngay.err; k++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - luiNgay, 9 + (k % 9), (k * 7) % 60);
      // Không vượt quá "bây giờ" — một lần chạy ở tương lai là dấu hiệu dữ liệu hỏng.
      if (at.getTime() > now.getTime()) at.setTime(now.getTime() - (k + 1) * 60_000);
      const repo = REPO[n % REPO.length];
      out.push(
        JSON.stringify({
          id: `${repo}-${100 + n}`,
          repo,
          number: 100 + n,
          rule: RULE[n % RULE.length],
          result: k < ngay.finished ? "ok" : k % 2 === 0 ? "fail" : "gave-up",
          turns: 3 + (n % 20),
          duration_s: 60 + ((n * 37) % 900),
          at: at.toISOString(),
        }),
      );
      n++;
    }
  });

  return out;
}
