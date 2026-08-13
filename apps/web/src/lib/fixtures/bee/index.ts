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
import dayTai from "./day-tai.json";
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
  "binh-thuong": "Bình thường",
  "day-tai": "Đầy tải",
  "co-su-co": "Có sự cố",
  "reconciler-chet": "Reconciler chết",
  "vua-cai": "Vừa cài xong",
};

const SCENES: Record<SceneId, unknown> = {
  "binh-thuong": binhThuong,
  "day-tai": dayTai,
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
