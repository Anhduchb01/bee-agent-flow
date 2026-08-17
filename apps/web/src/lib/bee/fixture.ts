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
  BeeSession,
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

    /*
     * Ba phiên mẫu phủ ba trạng thái màn danh sách phải vẽ khác nhau: đang
     * chạy (mở được live), đã xong, và chết cần người. Phiên đang chạy dùng
     * đúng id PHIEN_DEMO mà session-ctl trả về ở fixture mode — bấm "New
     * session" trên fixture là rơi vào trang live có chữ thật để xem.
     */
    async listSessions(): Promise<BeeSession[]> {
      if (chuaChayLanNao(await currentScene())) return [];
      return [phienDemoDangChay(), phienDemoXong(), phienDemoChet()];
    },

    async readSession(id): Promise<BeeSession | null> {
      const ds = await this.listSessions();
      return ds.find((p) => p.id === id) ?? null;
    },

    sessionRunPath(id): string | null {
      // Mọi phiên fixture stream cùng một run.jsonl thật ghi từ rig S0 —
      // hình dạng thật, không phải bịa.
      if (!id.startsWith("de3")) return null;
      return path.join(process.cwd(), "src", "lib", "fixtures", "bee", "session-run-demo.jsonl");
    },
  };
}

function phienDemoDangChay(): BeeSession {
  return {
    id: "de300000-0000-4000-8000-000000000001",
    slug: "myapp",
    num: 41,
    repo: "you/myapp",
    title: "Add CSV export to the report screen",
    phase: "work",
    status: "running",
    created_at: "2026-08-17T09:58:00Z",
    started_at: "2026-08-17T09:58:04Z",
    ended_at: null,
    attempt: 0,
    needs_human: false,
  };
}

function phienDemoXong(): BeeSession {
  return {
    id: "de300000-0000-4000-8000-000000000002",
    slug: "myapp",
    num: 40,
    repo: "you/myapp",
    title: "Legal pages share one layout",
    phase: "work",
    status: "done",
    created_at: "2026-08-13T09:00:00Z",
    started_at: "2026-08-13T09:00:05Z",
    ended_at: "2026-08-13T09:12:00Z",
    attempt: 0,
    needs_human: false,
  };
}

function phienDemoChet(): BeeSession {
  return {
    id: "de300000-0000-4000-8000-000000000003",
    slug: "blog",
    num: 7,
    repo: "you/blog",
    title: "Fix RSS feed encoding",
    phase: "work",
    status: "failed",
    created_at: "2026-08-16T22:10:00Z",
    started_at: "2026-08-16T22:10:03Z",
    ended_at: "2026-08-16T23:41:00Z",
    attempt: 2,
    needs_human: true,
  };
}
