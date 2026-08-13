import "server-only";

import { loadInbox } from "@/features/inbox";
import { allowedLogins, roleOf } from "@/lib/auth/allowlist";

import { lenKeHoach, type TinNhan } from "../lib/plan";
import { docState, ghiState } from "./store";

export interface KetQuaChay {
  tin: TinNhan[];
  boQua: Record<string, string>;
  daGui: boolean;
}

/**
 * Một lượt quét và bắn thông báo.
 *
 * Gọi từ một route handler theo lịch — **không** từ reconciler. Reconciler
 * không biết gì về Slack, và giữ nguyên như vậy: thêm một tích hợp vào vòng lặp
 * đó là thêm một cách để nó chết.
 */
export async function chayThongBao(now: Date = new Date()): Promise<KetQuaChay> {
  const goc = process.env.APP_URL ?? "http://127.0.0.1:3187";
  const webhook = process.env.SLACK_WEBHOOK_URL;

  const nguoi = await Promise.all(
    allowedLogins().map(async (login) => ({
      login,
      items: await loadInbox({ login, name: login, avatar_url: "", role: roleOf(login) }),
    })),
  );

  const state = await docState();
  const { tin, stateMoi, boQua } = lenKeHoach({ nguoi, state, goc, now });

  if (tin.length === 0) return { tin, boQua, daGui: false };

  // Chưa cấu hình webhook thì trả payload ra thay vì gửi. Nhờ vậy toàn bộ logic
  // gộp và chống lặp kiểm được trên fixture; webhook thật để pha B.
  if (webhook) {
    for (const t of tin) {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t.text }),
      });
      // Gửi hỏng thì **không** đánh dấu đã báo — thà báo lại còn hơn im luôn.
      if (!res.ok) {
        return { tin, boQua, daGui: false };
      }
    }
  }

  await ghiState({ ...state, ...stateMoi });
  return { tin, boQua, daGui: Boolean(webhook) };
}
