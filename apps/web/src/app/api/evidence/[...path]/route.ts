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
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const actor = await getActor();
  if (!actor) return new Response("forbidden", { status: 401 });

  const { path } = await params;
  const file = await getBee().readEvidenceFile(path ?? []);
  if (!file) return new Response("no such file", { status: 404 });

  const common = {
    // `no-cache` does NOT mean "do not store" — it means revalidate before
    // use. With the etag, an untouched file costs one 304 and no bytes.
    //
    // It used to be `max-age=3600`, on the reasoning that evidence keyed by a
    // `<sha>/` is immutable. True for that layout, and false for the one
    // people actually look at: re-recording a demo overwrites
    // `sessions/<id>/evidence/<name>`, so the owner was shown the first take
    // for an hour with nothing to say why (27/08).
    "Cache-Control": "private, no-cache",
    ETag: file.etag,
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "X-Content-Type-Options": "nosniff",
  };

  if (req.headers.get("if-none-match") === file.etag) {
    return new Response(null, { status: 304, headers: common });
  }

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      ...common,
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.byteLength),
    },
  });
}
