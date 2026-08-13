import type { InboxItem, InboxKind } from "./derive";

/**
 * Bộ lọc của bảng việc. Hàm thuần, tách khỏi component — logic lọc là thứ dễ
 * sai âm thầm nhất trong một bảng (một `&&` thành `||` là danh sách sai mà
 * không có gì đỏ), nên nó test được mà không phải dựng DOM.
 */
export interface BoLoc {
  loai: InboxKind | "tat-ca";
  duAn: string | "tat-ca";
  tim: string;
  /** Chỉ hiện việc đã chờ quá ngưỡng này. `0` = không lọc. */
  choLauHonS: number;
  uuTien: boolean;
}

export const BO_LOC_RONG: BoLoc = {
  loai: "tat-ca",
  duAn: "tat-ca",
  tim: "",
  choLauHonS: 0,
  uuTien: false,
};

export const NGUONG_CHO = [
  { value: 0, label: "Any wait" },
  { value: 3600, label: "Over 1 hour" },
  { value: 4 * 3600, label: "Over 4 hours" },
  { value: 24 * 3600, label: "Over 1 day" },
] as const;

/** Bỏ dấu để "loc don" tìm được "lọc đơn" — người ta gõ không dấu khi vội. */
function chuanHoa(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export function locViec(items: InboxItem[], boLoc: BoLoc): InboxItem[] {
  const tim = chuanHoa(boLoc.tim);

  return items.filter((i) => {
    if (boLoc.loai !== "tat-ca" && i.kind !== boLoc.loai) return false;
    if (boLoc.duAn !== "tat-ca" && i.slug !== boLoc.duAn) return false;
    if (boLoc.uuTien && !i.priority) return false;
    if (boLoc.choLauHonS > 0 && i.waitingS < boLoc.choLauHonS) return false;
    if (tim && !chuanHoa(`${i.title} ${i.slug}#${i.number}`).includes(tim)) return false;
    return true;
  });
}

export function coLocGiKhong(boLoc: BoLoc): boolean {
  return (
    boLoc.loai !== "tat-ca" ||
    boLoc.duAn !== "tat-ca" ||
    boLoc.tim.trim() !== "" ||
    boLoc.choLauHonS > 0 ||
    boLoc.uuTien
  );
}

/** Danh sách dự án có mặt trong dữ liệu, để dựng ô chọn mà không bịa tên. */
export function duAnCoTrong(items: InboxItem[]): string[] {
  return [...new Set(items.map((i) => i.slug))].sort();
}

/** Loại việc có mặt trong dữ liệu — không hiện lựa chọn dẫn tới bảng rỗng. */
export function loaiCoTrong(items: InboxItem[]): InboxKind[] {
  return [...new Set(items.map((i) => i.kind))];
}
