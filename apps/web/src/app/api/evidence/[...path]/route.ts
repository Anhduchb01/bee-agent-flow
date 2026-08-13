import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";

/**
 * Phục vụ file bằng chứng từ đĩa.
 *
 * Hai chốt, và cả hai đều cần thiết:
 *
 * 1. **Tự kiểm session.** Không tin `proxy.ts` — Next đã từng ship CVE bỏ qua
 *    middleware bằng một header (CVE-2025-29927). Người ngoài allowlist không
 *    đọc được một byte nào.
 * 2. **Đường dẫn không được thoát ra ngoài gốc bằng chứng.** App chạy dưới
 *    `bee-web` thuộc group `bee`, nên một `../../` lọt qua là đọc được
 *    `/etc/bee/orch.env` — tức là token của orchestrator. Việc chặn nằm trong
 *    `resolveEvidencePath`, dùng chung cho cả fixture lẫn đĩa thật.
 *
 * Đường dẫn xấu và file không tồn tại trả **cùng một câu trả lời** 404: phân
 * biệt hai thứ đó là kể cho người dò biết họ đang dò đúng hướng.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const actor = await getActor();
  if (!actor) return new Response("không có quyền", { status: 401 });

  const { path } = await params;
  const file = await getBee().readEvidenceFile(path ?? []);
  if (!file) return new Response("không có file này", { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.byteLength),
      // Bằng chứng gắn với một SHA nên nó bất biến; nhưng nó cũng chỉ dành cho
      // người đã đăng nhập, nên cache phải là private.
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
