"use server";

import { revalidatePath } from "next/cache";

import { ghiThaoTac } from "@/features/notify";
import { getActor } from "@/lib/auth";
import { getGithub } from "@/lib/github";

export interface KetQua {
  ok: boolean;
  message: string;
}

/**
 * Mọi hành động ở đây tự kiểm session, không tin `proxy.ts`, và ghi lên GitHub
 * bằng danh tính của **người vừa bấm**. Không có token bot dùng chung: dấu vết
 * kiểm toán chỉ đúng khi nó mang tên người thật.
 */
async function nguoiBam() {
  const actor = await getActor();
  if (!actor) throw new Error("Bạn không có quyền làm việc này.");
  // Người vừa bấm gì đó đang nhìn thẳng vào app; đừng bắn Slack cho họ ngay sau đó.
  await ghiThaoTac(actor.login);
  return actor;
}

function lamMoi(slug: string, num: number) {
  revalidatePath(`/t/${slug}/${num}`);
  revalidatePath("/");
}

/**
 * Chat vào task = post một comment thường có chèn `@claude`.
 *
 * App **không** gọi model và **không** chạy agent. Rule 02 nhặt comment ở tick
 * sau, `--resume` đúng phiên cũ nhờ `session_id` trong `claim.json`. Toàn bộ
 * phần khó đã nằm trong reconciler; ở đây chỉ là một lần ghi.
 */
export async function guiComment(slug: string, num: number, body: string): Promise<KetQua> {
  const actor = await nguoiBam();
  const noiDung = body.trim();
  if (!noiDung) return { ok: false, message: "Chưa có nội dung." };

  const co = /@claude\b/i.test(noiDung);
  await getGithub().addComment(slug, num, co ? noiDung : `@claude ${noiDung}`, actor);
  lamMoi(slug, num);

  return { ok: true, message: "Đã gửi" };
}

/** PM duyệt spec: gỡ `status:spec-review`, gắn `agent:build`. */
export async function duyetSpec(slug: string, num: number): Promise<KetQua> {
  const actor = await nguoiBam();
  if (actor.role !== "pm") return { ok: false, message: "Chỉ PM duyệt spec." };

  await getGithub().removeLabel(slug, num, "status:spec-review", actor);
  await getGithub().addLabel(slug, num, "agent:build", actor);
  lamMoi(slug, num);

  return { ok: true, message: "Đã duyệt spec — còn một bước nữa là giao cho agent" };
}

/**
 * `agent:eligible` là cờ **opt-in**. Người gắn nó chịu trách nhiệm rằng task
 * này phù hợp để giao máy — nên nó là một hành động riêng, không gộp vào việc
 * duyệt spec.
 */
export async function giaoChoAgent(slug: string, num: number): Promise<KetQua> {
  const actor = await nguoiBam();

  await getGithub().addLabel(slug, num, "agent:eligible", actor);
  lamMoi(slug, num);

  return { ok: true, message: "Đã giao — agent sẽ nhận ở tick sau nếu còn slot" };
}

/**
 * Duyệt PR. Ghi một approve trên GitHub mang tên người bấm; tick sau rule 05
 * đẩy `bee/approvals` chuyển xanh.
 *
 * **Không có hàm merge trong file này, và sẽ không có.** Merge xảy ra trên
 * GitHub, sau khi có người thật đọc diff.
 */
export async function duyetPR(slug: string, num: number): Promise<KetQua> {
  const actor = await nguoiBam();

  await getGithub().approve(slug, num, actor);
  lamMoi(slug, num);

  return { ok: true, message: "Đã duyệt — merge trên GitHub" };
}
