import { KIND_LABEL, type InboxItem } from "@/features/inbox";

/**
 * Khoảng cách tối thiểu giữa hai tin gửi cho cùng một người.
 *
 * Đây là chỗ "gộp, không spam" thực sự xảy ra: trong một đợt dồn, mọi mục mới
 * dồn vào một tin thay vì mỗi mục một tin. Nó **không** làm chậm trường hợp
 * thường — hộp thư đang yên thì tin đầu tiên đi ngay, nên thước đo "dưới 2 phút
 * từ lúc agent xong tới lúc người biết" vẫn đạt.
 */
export const GAP_S = 300;

/**
 * Vừa thao tác trong app thì đừng báo — họ đang nhìn thẳng vào nó.
 * Một tin Slack lúc này chỉ là tiếng ồn.
 */
export const IM_LANG_SAU_THAO_TAC_S = 120;

export interface NguoiNhan {
  login: string;
  /** Kênh/webhook riêng nếu có; không thì dùng webhook chung. */
  items: InboxItem[];
}

export interface TrangThaiBao {
  /** Khoá mục → thời điểm đã báo. */
  daBao: Record<string, string>;
  /** Lần gửi gần nhất cho người này. */
  lanCuoi: string | null;
  /** Lần người này thao tác trong app gần nhất. */
  thaoTacCuoi: string | null;
}

export interface TinNhan {
  login: string;
  text: string;
  keys: string[];
}

export interface KetQuaLenKeHoach {
  tin: TinNhan[];
  /** State mới cho từng người — chỉ đổi với người thực sự được gửi tin. */
  stateMoi: Record<string, TrangThaiBao>;
  /** Vì sao một người không được gửi. Để debug mà không phải đoán. */
  boQua: Record<string, string>;
}

const RONG: TrangThaiBao = { daBao: {}, lanCuoi: null, thaoTacCuoi: null };

function giay(from: string | null, now: Date): number {
  if (!from) return Number.POSITIVE_INFINITY;
  const t = Date.parse(from);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : (now.getTime() - t) / 1000;
}

function dongTin(item: InboxItem, goc: string): string {
  return [
    `🐝 #${item.number} ${KIND_LABEL[item.kind].toLowerCase()} · ${item.slug}`,
    `   "${item.title}"`,
    `   → ${goc}/t/${item.slug}/${item.number}`,
  ].join("\n");
}

/**
 * Quyết định gửi gì cho ai. Hàm thuần: không đọc đồng hồ, không gọi mạng,
 * không chạm đĩa — nên ba luật chống spam đều test được thẳng.
 */
export function lenKeHoach({
  nguoi,
  state,
  goc,
  now,
}: {
  nguoi: NguoiNhan[];
  state: Record<string, TrangThaiBao>;
  goc: string;
  now: Date;
}): KetQuaLenKeHoach {
  const tin: TinNhan[] = [];
  const stateMoi: Record<string, TrangThaiBao> = {};
  const boQua: Record<string, string> = {};

  for (const n of nguoi) {
    const cu = state[n.login] ?? RONG;
    const moi = n.items.filter((i) => !(i.key in cu.daBao));

    if (moi.length === 0) {
      boQua[n.login] = "không có mục nào mới";
      continue;
    }
    if (giay(cu.thaoTacCuoi, now) < IM_LANG_SAU_THAO_TAC_S) {
      boQua[n.login] = "vừa thao tác trong app";
      continue;
    }
    if (giay(cu.lanCuoi, now) < GAP_S) {
      boQua[n.login] = "vừa gửi tin, gộp vào lượt sau";
      continue;
    }

    // Chờ lâu nhất lên đầu, giống hộp thư — người đọc tin và người mở app
    // phải thấy cùng một thứ tự.
    const sap = [...moi].sort((a, b) => b.waitingS - a.waitingS);
    const dau =
      sap.length === 1
        ? dongTin(sap[0], goc)
        : `🐝 ${sap.length} việc đang chờ bạn\n\n${sap.map((i) => dongTin(i, goc)).join("\n\n")}`;

    tin.push({ login: n.login, text: dau, keys: sap.map((i) => i.key) });

    const nowIso = now.toISOString();
    stateMoi[n.login] = {
      // Chỉ giữ lại mục còn đang chờ: mục đã xử lý xong mà quay lại sau này là
      // một việc mới, và đáng được báo lại.
      daBao: Object.fromEntries([
        ...n.items.filter((i) => i.key in cu.daBao).map((i) => [i.key, cu.daBao[i.key]]),
        ...sap.map((i) => [i.key, nowIso]),
      ]),
      lanCuoi: nowIso,
      thaoTacCuoi: cu.thaoTacCuoi,
    };
  }

  return { tin, stateMoi, boQua };
}
