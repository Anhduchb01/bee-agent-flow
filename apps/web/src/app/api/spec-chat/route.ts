import http from "node:http";

import { getActor } from "@/lib/auth";
import { docRepos } from "@/lib/github/repos-store";

/**
 * Cửa sổ phỏng vấn tạo task — cầu nối giữa trình duyệt và `bee-spec-chat`.
 *
 * App KHÔNG gọi `claude`. Nó không có credential Claude và không được có: nó là
 * user duy nhất trong hệ thống này đưa ra internet. Nó gửi văn bản qua một Unix
 * socket tới một tiến trình chạy dưới `bee-agent`, và nhận văn bản về.
 *
 * Route này tự kiểm session, không tin `proxy.ts` — cùng lý do với route bằng
 * chứng: Next đã từng ship CVE bỏ qua middleware bằng một header
 * (CVE-2025-29927). Một endpoint tiêu hạn mức Claude mà ai gọi cũng được là
 * cách nhanh nhất để người lạ đốt sạch quota của bạn.
 */
const SOCKET = process.env.BEE_SPEC_SOCKET ?? "/run/bee/spec-chat.sock";

/** Chặn ở đây nữa, không chỉ ở tiến trình kia — thân request đi vào argv. */
const MAX_BYTES = 32 * 1024;

export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response("forbidden", { status: 401 });

  const raw = await req.text();

  // `task_id` đi thẳng vào đường dẫn cwd của tiến trình kia, và nó quyết định
  // PHIÊN NÀO được nối lại. Cầu nối đã kiểm hình dạng, nhưng hình dạng không
  // trả lời được câu quan trọng hơn: task đó có thuộc một dự án trên dashboard
  // này không.
  //
  // Với hai người dùng cùng thấy mọi dự án thì hôm nay nó vô hại. Ngày thêm
  // người thứ ba chỉ được vào một dự án, dòng dưới đây là thứ duy nhất ngăn họ
  // đọc hội thoại của dự án kia — và lúc ấy sẽ không ai nhớ ra để thêm nó.
  try {
    const body = JSON.parse(raw || "{}") as { mode?: string; task_id?: string };
    if (body.mode === "hoi-run") {
      const slug = String(body.task_id ?? "").replace(/-\d+$/, "");
      const biet = (await docRepos()).some((r) => r.slug === slug);
      if (!biet) {
        return new Response(
          JSON.stringify({ type: "done", error: "Task này không thuộc dự án nào trên dashboard." }) + "\n",
          { status: 403, headers: { "content-type": "application/x-ndjson" } },
        );
      }
    }
  } catch {
    // Thân không phải JSON — cầu nối sẽ từ chối với thông báo của nó.
  }

  if (raw.length > MAX_BYTES) {
    return new Response(JSON.stringify({ type: "done", error: "tin nhắn quá dài" }) + "\n", {
      status: 413,
      headers: { "content-type": "application/x-ndjson" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const hong = (why: string) => {
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify({ type: "done", error: why }) + "\n"),
        );
        controller.close();
      };

      const upstream = http.request(
        { socketPath: SOCKET, path: "/chat", method: "POST",
          headers: { "content-type": "application/json" } },
        (res) => {
          res.on("data", (c: Buffer) => controller.enqueue(new Uint8Array(c)));
          res.on("end", () => controller.close());
          res.on("error", () => controller.close());
        },
      );

      upstream.on("error", (e) => {
        // Nói ra ĐÚNG nguyên nhân hay gặp nhất. `ENOENT` ở đây nghĩa là dịch vụ
        // phỏng vấn chưa được bật — không phải "mất mạng", không phải "Claude
        // hỏng", và một câu chung chung sẽ gửi người ta đi tìm nhầm chỗ.
        const code = (e as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ECONNREFUSED") {
          hong(
            "Chưa bật dịch vụ phỏng vấn (bee-spec-chat). Trên máy chạy bee: sudo systemctl status bee-spec-chat",
          );
        } else if (code === "EACCES") {
          hong(`Không mở được ${SOCKET} — user chạy web app phải thuộc group của socket đó.`);
        } else {
          hong(`Không nối được tới dịch vụ phỏng vấn: ${code ?? String(e)}`);
        }
      });

      upstream.end(raw);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
