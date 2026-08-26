import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { getBee } from "./index";
import { docHangDoi, ghiHangDoi } from "./queue-fs";
import { chayMotNhip } from "./queue-run";
import { moPhien } from "./session-ctl";

/**
 * Một nhịp Autopilot, nối dây vào đĩa + systemd.
 *
 * Ở đây vì có HAI người gọi và chỉ được có MỘT bản luật: `bee-tick.timer` gõ
 * vào `/api/tick` mỗi 30 phút, và nút "Run now" trên bảng dự án gọi thẳng khi
 * người dùng không muốn chờ. Nếu để mỗi bên tự nối dây, hai đường sẽ trôi khỏi
 * nhau đúng lúc khó phát hiện nhất — một cái phanh hạn mức, cái kia không.
 *
 * Luật thuần vẫn nằm ở `queue-run.ts`; file này chỉ bơm tác dụng phụ vào.
 *
 * KHÔNG có khung giờ nào ở đây, và chưa bao giờ có: Autopilot chạy bất cứ lúc
 * nào trong ngày. "Đi ngủ" chỉ là câu chuyện dùng trong PRD, không phải lịch.
 */

export interface KetQuaNhipHang {
  daMo: string | null;
  lyDo: string;
}

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

export async function chayNhipHangDoi(): Promise<KetQuaNhipHang> {
  const goc = root();
  const q = await docHangDoi(goc);
  // Hàng rỗng thì đừng chạm gì thêm — tick nhẹ nhất có thể khi không có việc.
  if (q.items.length === 0) return { daMo: null, lyDo: "the queue is empty" };

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
        // Work that may run with nobody watching: tell the agent which issue
        // it is on instead of making it guess from the session title.
        systemPrompt: `You are working on issue #${v.issue} of ${v.repo}. Read the issue with gh, follow its acceptance criteria, then open a PR with the bee-push-pr skill.`,
      });
    },
    ghi: (moi) => ghiHangDoi(goc, moi),
  });

  return { daMo: kq.daMo === null ? null : `${kq.daMo.repo}#${kq.daMo.issue}`, lyDo: kq.lyDo };
}
