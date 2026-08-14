import "server-only";

import path from "node:path";

import { isSceneId, recentRunsJson, sceneJson, type SceneId } from "@/lib/fixtures/bee";
import { chuaChayLanNao, currentScene } from "@/lib/fixtures/scene";

import { listEvidenceIn, readEvidenceFileIn } from "./evidence-fs";
import { parseRecentLine, parseStatus } from "./parse";
import type { BeeClaudeRateLimit, BeeRecentRun, BeeSource, StatusRead } from "./types";

const EVIDENCE_ROOT = path.join(process.cwd(), "src", "lib", "fixtures", "evidence");

function sceneId(want: string): SceneId {
  return isSceneId(want) ? want : "binh-thuong";
}

export function createFixtureBeeSource(): BeeSource {
  return {
    async readStatus(): Promise<StatusRead> {
      const want = await currentScene();

      // Hai cảnh đặc biệt: file chưa tồn tại và file đang ghi dở. `vua-cai` đã
      // lo phần "chưa có repo nào", còn đây là phần "chưa có status.json nào" —
      // hai chuyện khác nhau, và cả hai đều xảy ra thật ngay sau install.sh.
      if (want === "chua-co-file") {
        return { ok: false, reason: "missing", detail: "status.json does not exist" };
      }
      if (want === "json-hong") {
        return parseStatus('{"heartbeat": "2026-08-1');
      }
      return parseStatus(sceneJson(sceneId(want)));
    },

    async readRecent(limit = 20): Promise<BeeRecentRun[]> {
      const want = await currentScene();

      // Máy chưa đăng ký repo nào (`vua-cai`) hoặc còn chưa có `status.json`
      // (`chua-co-file`) thì cũng chưa chạy lần nào. Cứ trả lịch sử ra ở đó là
      // dựng một cảnh tự mâu thuẫn — và một cảnh tự mâu thuẫn thì không duyệt
      // được, vì không biết phần nào mới là phần đang sai.
      if (chuaChayLanNao(want)) return [];

      // Bảy ngày lịch sử, không phải vài dòng trong `repos[].recent` của
      // status.json — biểu đồ xu hướng cần một cửa sổ thật để có gì mà nói.
      return recentRunsJson()
        .map(parseRecentLine)
        .filter((r): r is BeeRecentRun => r !== null)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit);
    },

    async readClaudeRateLimit(): Promise<BeeClaudeRateLimit | null> {
      // Chưa chạy lần nào thì chưa có `rate_limit_event` nào — cùng một cảnh
      // với `phanTram: null` ở `lib/claude/fixture.ts`, và phải khớp nhau, nếu
      // không thì cảnh `vua-cai` lại tự mâu thuẫn một lần nữa.
      if (chuaChayLanNao(await currentScene())) return null;
      return {
        status: "allowed",
        resetsAt: Math.floor(Date.now() / 1000) + 2 * 3600 + 14 * 60,
        rateLimitType: "five_hour",
        overageStatus: "not_configured",
        isUsingOverage: false,
        seen_at: new Date(Date.now() - 6 * 60_000).toISOString(),
      };
    },

    listEvidence: (slug, num) => listEvidenceIn(EVIDENCE_ROOT, slug, num),
    readEvidenceFile: (segments) => readEvidenceFileIn(EVIDENCE_ROOT, segments),
  };
}
