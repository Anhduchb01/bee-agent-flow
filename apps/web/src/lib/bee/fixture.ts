import "server-only";

import path from "node:path";

import { cookies } from "next/headers";

import { isSceneId, recentRunsJson, sceneJson, type SceneId } from "@/lib/fixtures/bee";

import { listEvidenceIn, readEvidenceFileIn } from "./evidence-fs";
import { parseRecentLine, parseStatus } from "./parse";
import type { BeeRecentRun, BeeSource, StatusRead } from "./types";

const EVIDENCE_ROOT = path.join(process.cwd(), "src", "lib", "fixtures", "evidence");

/** Cookie chọn cảnh. `disk.ts` không đọc nó, nên trên máy thật nó vô nghĩa. */
export const SCENE_COOKIE = "bee-canh";

/**
 * Cảnh nào được dùng là chuyện của **riêng module này**.
 *
 * Cookie đứng trước biến môi trường để đi qua đủ 5 cảnh không phải khởi động
 * lại app — đó là cách W12 làm được. Đọc cookie ở đây chứ không ở màn hình là
 * điều giữ cho đường ranh còn nguyên: không component nào biết mình đang xem
 * fixture, và trên máy thật cookie này không có tác dụng gì.
 */
async function scene(): Promise<string> {
  try {
    const fromCookie = (await cookies()).get(SCENE_COOKIE)?.value;
    if (fromCookie) return fromCookie;
  } catch {
    // Ngoài ngữ cảnh request (test, script) thì không có cookie — dùng env.
  }
  return process.env.BEE_FIXTURE_SCENE ?? "binh-thuong";
}

function sceneId(want: string): SceneId {
  return isSceneId(want) ? want : "binh-thuong";
}

export function createFixtureBeeSource(): BeeSource {
  return {
    async readStatus(): Promise<StatusRead> {
      const want = await scene();

      // Hai cảnh đặc biệt: file chưa tồn tại và file đang ghi dở. `vua-cai` đã
      // lo phần "chưa có repo nào", còn đây là phần "chưa có status.json nào" —
      // hai chuyện khác nhau, và cả hai đều xảy ra thật ngay sau install.sh.
      if (want === "chua-co-file") {
        return { ok: false, reason: "missing", detail: "status.json chưa tồn tại" };
      }
      if (want === "json-hong") {
        return parseStatus('{"heartbeat": "2026-08-1');
      }
      return parseStatus(sceneJson(sceneId(want)));
    },

    async readRecent(limit = 20): Promise<BeeRecentRun[]> {
      // Bảy ngày lịch sử, không phải vài dòng trong `repos[].recent` của
      // status.json — biểu đồ xu hướng cần một cửa sổ thật để có gì mà nói.
      return recentRunsJson()
        .map(parseRecentLine)
        .filter((r): r is BeeRecentRun => r !== null)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit);
    },

    listEvidence: (slug, num) => listEvidenceIn(EVIDENCE_ROOT, slug, num),
    readEvidenceFile: (segments) => readEvidenceFileIn(EVIDENCE_ROOT, segments),
  };
}
