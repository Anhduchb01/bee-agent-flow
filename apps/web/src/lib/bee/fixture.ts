import "server-only";

import path from "node:path";

import { isSceneId, recentRunsJson, sceneJson, type SceneId } from "@/lib/fixtures/bee";
import { chuaChayLanNao, currentScene } from "@/lib/fixtures/scene";

import { listEvidenceIn, readEvidenceFileIn } from "./evidence-fs";
import { parseRecentLine, parseStatus } from "./parse";
import type {
  BeeClaudeRateLimit,
  BeeRecentRun,
  BeeRun,
  BeeRunDetail,
  BeeSource,
  StatusRead,
} from "./types";

const EVIDENCE_ROOT = path.join(process.cwd(), "src", "lib", "fixtures", "evidence");

function sceneId(want: string): SceneId {
  return isSceneId(want) ? want : "binh-thuong";
}

/** Một lần chạy mẫu. Số liệu khớp với dòng tương ứng trong `recentRunsJson()`. */
function runMau(): BeeRun {
  return {
    dir: "myapp-40-20260813T091200Z",
    id: "myapp-40",
    repo: "myapp",
    number: 40,
    rule: "07-build",
    result: "ok",
    at: "2026-08-13T09:12:00Z",
    turns: 9,
    duration_s: 264,
    session_id: "4f5427ca-3b78-4c80-936e-33a6420fb316",
  };
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

    /*
     * Fixture dựng đúng MỘT lần chạy, cho task #40 của myapp — task duy nhất
     * trong seed có cả PR lẫn bằng chứng, nên nó là chỗ màn hình chi tiết được
     * xem đầy đủ nhất.
     *
     * Cảnh chưa chạy lần nào thì không có gì, giống mọi nguồn khác — một danh
     * sách lần chạy có nội dung trên một máy vừa cài là cảnh tự mâu thuẫn.
     */
    async listRuns(slug, num): Promise<BeeRun[]> {
      if (chuaChayLanNao(await currentScene())) return [];
      if (slug !== "myapp" || num !== 40) return [];
      return [runMau()];
    },

    async readRun(slug, num, dir): Promise<BeeRunDetail | null> {
      const ds = await this.listRuns(slug, num);
      if (!ds.some((r) => r.dir === dir)) return null;
      return {
        ...runMau(),
        output: [
          "**Done**",
          "- Tách `legal-document.tsx` để hai trang dùng chung phần khung",
          "- Thêm test cho cả hai đường",
          "",
          "**Tests** — `scripts/ci.sh` xanh, 24 test.",
          "",
          "**Unsure** — chưa rõ có cần trang tiếng Anh không, tôi đoán là chưa.",
        ].join("\n"),
        steps: [
          { kind: "noi", text: "Đọc issue và tìm chỗ đặt trang." },
          { kind: "tool", text: "Grep" },
          { kind: "tool", text: "Read" },
          { kind: "noi", text: "Hai trang dùng chung phần khung, nên tôi tách một component." },
          { kind: "tool", text: "Write" },
          { kind: "tool", text: "Bash" },
          { kind: "noi", text: "Suite xanh. Dừng ở đây." },
        ],
        usage: {
          tokens_in: 12_400,
          tokens_out: 8_900,
          tokens_cache_read: 980_000,
          tokens_cache_write: 31_000,
          cost_usd: 0.42,
          stop_reason: "end_turn",
          api_error_status: null,
        },
      };
    },

    listEvidence: (slug, num) => listEvidenceIn(EVIDENCE_ROOT, slug, num),
    readEvidenceFile: (segments) => readEvidenceFileIn(EVIDENCE_ROOT, segments),
  };
}
