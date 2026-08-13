import "server-only";

import { getBee } from "@/lib/bee";
import { getGithub } from "@/lib/github";
import type { Actor } from "@/lib/github/types";

import { deriveInbox, type InboxItem } from "../lib/derive";

/**
 * Gom đủ dữ liệu cho hộp thư rồi giao cho hàm thuần `deriveInbox` quyết định.
 *
 * Trên fixture mọi thứ nằm trong bộ nhớ nên vòng lặp dưới đây là miễn phí. Trên
 * dữ liệu thật nó là một lần gọi API cho mỗi task, và **đó là chỗ phải sửa ở
 * pha B2** — bằng một truy vấn GraphQL gộp, không phải bằng cách bỏ bớt dữ liệu
 * để danh sách chạy nhanh hơn.
 */
export async function loadInbox(actor: Actor): Promise<InboxItem[]> {
  const gh = getGithub();
  const bee = getBee();

  const tasks = await gh.listTasks();
  const moTask = tasks.filter((t) => t.state === "open");

  const timelines = Object.fromEntries(
    await Promise.all(
      moTask.map(
        async (t) => [`${t.slug}#${t.number}`, await gh.listTimeline(t.slug, t.number)] as const,
      ),
    ),
  );

  // Bằng chứng phải khớp đúng SHA đang là head của PR. Bằng chứng của một
  // commit cũ chứng minh cho một bản code không còn tồn tại.
  const coBangChung = new Set<string>();
  await Promise.all(
    moTask
      .filter((t) => t.pull)
      .map(async (t) => {
        for (const run of await bee.listEvidence(t.slug, t.pull!.number)) {
          if (run.files.length > 0) coBangChung.add(`${t.slug}#${t.pull!.number}#${run.sha}`);
        }
      }),
  );

  return deriveInbox({
    tasks: moTask,
    timelines,
    hasEvidence: (slug, pr, sha) => coBangChung.has(`${slug}#${pr}#${sha}`),
    actor,
  });
}
