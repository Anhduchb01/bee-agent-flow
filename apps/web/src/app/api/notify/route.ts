import { chayThongBao } from "@/features/notify";

/**
 * Bắn thông báo cho một lượt. Được gọi **theo lịch** (systemd timer trên máy
 * agent), không phải bởi người dùng và không phải bởi reconciler.
 *
 * Vì không có session để kiểm, nó dùng một bí mật dùng chung. Khi chạy dữ liệu
 * thật mà thiếu bí mật đó, route này **tắt hẳn** thay vì mở toang: một endpoint
 * ai gọi cũng được là một cách để người ngoài dò xem hộp thư của người khác có
 * gì, qua chính nội dung tin.
 */
export async function POST(req: Request) {
  const secret = process.env.NOTIFY_SECRET;
  const isLive = process.env.GITHUB_SOURCE === "live";

  if (isLive && !secret) {
    return Response.json({ error: "NOTIFY_SECRET chưa cấu hình" }, { status: 503 });
  }
  if (secret && req.headers.get("x-bee-notify") !== secret) {
    return Response.json({ error: "không có quyền" }, { status: 401 });
  }

  const ketQua = await chayThongBao();
  return Response.json({
    gui: ketQua.tin.map((t) => ({ login: t.login, keys: t.keys, text: t.text })),
    boQua: ketQua.boQua,
    daGuiThat: ketQua.daGui,
  });
}
