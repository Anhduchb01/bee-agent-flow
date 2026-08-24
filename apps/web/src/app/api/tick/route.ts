import { timingSafeEqual } from "node:crypto";

import fs from "node:fs/promises";
import path from "node:path";

import { fetchClaudeAccountUsage, harvestClaudeUsage } from "@/lib/bee/machine-ctl";
import { docHangDoi, ghiHangDoi } from "@/lib/bee/queue-fs";
import { chayMotNhip } from "@/lib/bee/queue-run";
import { moPhien } from "@/lib/bee/session-ctl";
import { getBee } from "@/lib/bee";

/**
 * Nhịp nền của bee — `bee-tick.timer` gọi vào đây, không có ai đăng nhập.
 *
 * VÌ SAO LÀ ROUTE CHỨ KHÔNG PHẢI SCRIPT BASH (spec V3 D2): mọi chính sách —
 * làm mới hạn mức, sau này là phanh và hàng đợi — đã sống trong TS. Viết lại
 * chúng bằng bash là nuôi hai bản của cùng một luật, đúng loại trôi mà repo
 * này ghét nhất. Timer chỉ còn là cái đồng hồ.
 *
 * Ranh giới: đây là đường DUY NHẤT vào app mà không qua session người dùng,
 * nên nó phải tự gác. Token nằm trong web.env (`BEE_TICK_TOKEN`, install.sh
 * sinh), so sánh timing-safe, và không có token cấu hình thì route đóng hẳn —
 * mở sẵn cho bất kỳ ai gọi được localhost là cái giá quá đắt cho một tiện ích.
 */

function dungToken(req: Request): boolean {
  const mong = process.env.BEE_TICK_TOKEN ?? "";
  if (mong === "") return false;
  const gui = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const a = Buffer.from(gui);
  const b = Buffer.from(mong);
  // Độ dài khác nhau thì timingSafeEqual NÉM, nên phải chặn trước — và trả về
  // false chứ không so tiếp, vì độ dài vốn không phải bí mật.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<Response> {
  if ((process.env.BEE_TICK_TOKEN ?? "") === "") {
    return Response.json(
      { ok: false, message: "BEE_TICK_TOKEN chưa cấu hình — tick đang đóng." },
      { status: 503 },
    );
  }
  if (!dungToken(req)) return Response.json({ ok: false }, { status: 401 });

  // Hai nửa độc lập: endpoint tài khoản hỏng không được chặn phần harvest cục
  // bộ, và ngược lại. Mỗi nửa tự báo sự thật của nó.
  // Thứ tự cố ý: làm mới hạn mức TRƯỚC khi quyết mở phiên. Phanh (FR-3.3)
  // đọc chính con số vừa lấy về, nên hai việc này không được đảo.
  const [quota, local] = await Promise.all([fetchClaudeAccountUsage(), harvestClaudeUsage()]);

  const hang = await chayHangDoi();

  return Response.json({
    ok: true,
    at: new Date().toISOString(),
    quota,
    local,
    queue: hang,
  });
}

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

/**
 * Nhịp hàng đợi. Mọi tác dụng phụ được bơm vào `chayMotNhip` để luật chạy-đêm
 * kiểm được bằng test; ở đây chỉ là nối dây vào đĩa và systemd.
 */
async function chayHangDoi(): Promise<{ daMo: string | null; lyDo: string }> {
  const goc = root();
  const q = await docHangDoi(goc);
  // Hàng rỗng thì đừng chạm gì thêm — tick nhẹ nhất có thể khi không có việc.
  if (q.items.length === 0) return { daMo: null, lyDo: "hàng đợi trống" };

  const dangPause = await fs
    .access(path.join(goc, "PAUSE"))
    .then(() => true)
    .catch(() => false);
  const phien = await getBee().listSessions();

  const kq = await chayMotNhip({
    hangDoi: q,
    dangPause,
    soPhienDangChay: phien.filter((p) => p.status === "running" || p.status === "starting").length,
    songSongToiDa: Number(process.env.QUEUE_MAX_PARALLEL ?? 1),
    moPhien: async (v) => {
      const daCo = phien.filter((p) => p.slug === v.slug).length;
      return moPhien({
        slug: v.slug,
        num: daCo + 1,
        repo: v.repo,
        title: `#${v.issue}`,
        worktree: true,
        mode: v.mode,
        // Việc chạy lúc người đang ngủ: nói thẳng cho agent biết nó đang làm
        // issue nào, thay vì bắt nó đoán từ tiêu đề.
        systemPrompt: `Bạn đang làm issue #${v.issue} của ${v.repo}. Đọc issue bằng gh, làm theo acceptance criteria, rồi mở PR bằng skill bee-push-pr.`,
      });
    },
    ghi: (moi) => ghiHangDoi(goc, moi),
  });

  return { daMo: kq.daMo === null ? null : `${kq.daMo.repo}#${kq.daMo.issue}`, lyDo: kq.lyDo };
}