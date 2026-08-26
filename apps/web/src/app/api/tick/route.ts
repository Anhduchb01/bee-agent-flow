import { timingSafeEqual } from "node:crypto";

import { fetchClaudeAccountUsage, harvestClaudeUsage } from "@/lib/bee/machine-ctl";
import { runQueueTick } from "@/lib/bee/tick";

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

function validToken(req: Request): boolean {
  const mong = process.env.BEE_TICK_TOKEN ?? "";
  if (mong === "") return false;
  const send = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const a = Buffer.from(send);
  const b = Buffer.from(mong);
  // Độ dài khác nhau thì timingSafeEqual NÉM, nên phải chặn trước — và trả về
  // false chứ không so tiếp, vì độ dài vốn không phải bí mật.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<Response> {
  if ((process.env.BEE_TICK_TOKEN ?? "") === "") {
    return Response.json(
      { ok: false, message: "BEE_TICK_TOKEN is not configured — tick is closed." },
      { status: 503 },
    );
  }
  if (!validToken(req)) return Response.json({ ok: false }, { status: 401 });

  // Hai nửa độc lập: endpoint tài khoản hỏng không được chặn phần harvest cục
  // bộ, và ngược lại. Mỗi nửa tự báo sự thật của nó.
  // Thứ tự cố ý: làm mới hạn mức TRƯỚC khi quyết mở phiên. Phanh (FR-3.3)
  // đọc chính con số vừa lấy về, nên hai việc này không được đảo.
  const [quota, local] = await Promise.all([fetchClaudeAccountUsage(), harvestClaudeUsage()]);

  const queue = await runQueueTick();

  return Response.json({
    ok: true,
    at: new Date().toISOString(),
    quota,
    local,
    queue,
  });
}
