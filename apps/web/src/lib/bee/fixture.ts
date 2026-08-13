import "server-only";

import path from "node:path";

import { isSceneId, sceneJson, type SceneId } from "@/lib/fixtures/bee";

import { listEvidenceIn, readEvidenceFileIn } from "./evidence-fs";
import { parseStatus } from "./parse";
import type { BeeRecentRun, BeeSource, StatusRead } from "./types";

const EVIDENCE_ROOT = path.join(process.cwd(), "src", "lib", "fixtures", "evidence");

/**
 * Cảnh nào được dùng là một biến môi trường, không phải một tham số của UI.
 * Nhờ vậy W12 — bấm qua đủ 5 cảnh — làm được bằng cách khởi động lại app, mà
 * không màn hình nào biết là mình đang xem fixture.
 */
function scene(): SceneId {
  const want = process.env.BEE_FIXTURE_SCENE;
  return isSceneId(want) ? want : "binh-thuong";
}

export function createFixtureBeeSource(): BeeSource {
  return {
    async readStatus(): Promise<StatusRead> {
      // Cảnh đặc biệt: file chưa tồn tại. `vua-cai` đã lo phần "chưa có repo
      // nào", còn đây là phần "chưa có status.json nào" — hai chuyện khác nhau
      // và cả hai đều xảy ra thật ngay sau install.sh.
      if (process.env.BEE_FIXTURE_SCENE === "chua-co-file") {
        return { ok: false, reason: "missing", detail: "status.json chưa tồn tại" };
      }
      if (process.env.BEE_FIXTURE_SCENE === "json-hong") {
        return parseStatus('{"heartbeat": "2026-08-1');
      }
      return parseStatus(sceneJson(scene()));
    },

    async readRecent(limit = 20): Promise<BeeRecentRun[]> {
      const read = parseStatus(sceneJson(scene()));
      if (!read.ok) return [];
      return read.status.repos
        .flatMap((r) => r.recent)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit);
    },

    listEvidence: (slug, num) => listEvidenceIn(EVIDENCE_ROOT, slug, num),
    readEvidenceFile: (segments) => readEvidenceFileIn(EVIDENCE_ROOT, segments),
  };
}
