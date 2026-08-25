import "server-only";

import path from "node:path";

import { isSceneId, recentRunsJson, sceneJson, type SceneId } from "@/lib/fixtures/bee";
import { chuaChayLanNao, currentScene } from "@/lib/fixtures/scene";

import { readEvidenceFileIn } from "./evidence-fs";
import { parseRecentLine, parseStatus } from "./parse";
import type {
  BeeArtifact,
  BeeClaudeRateLimit,
  BeeRecentRun,
  BeeSession,
  BeeSource,
  StatusRead,
} from "./types";

const EVIDENCE_ROOT = path.join(process.cwd(), "src", "lib", "fixtures", "evidence");

function sceneId(want: string): SceneId {
  return isSceneId(want) ? want : "binh-thuong";
}

/** Một lần chạy mẫu. Số liệu khớp với dòng tương ứng trong `recentRunsJson()`. */

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

    readEvidenceFile: (segments) => readEvidenceFileIn(EVIDENCE_ROOT, segments),

    async readGc() {
      if (chuaChayLanNao(await currentScene())) return null;  // máy vừa cài: gc chưa chạy
      return {
        ts: "2026-08-24T15:00:00Z",
        removed: 2,
        freed_bytes: 1_932_735_283,
        age_hours: 24,
        items: [
          {
            id: "de300000-0000-4000-8000-000000000002",
            action: "removed" as const,
            reason: "đã push hết lên origin/bee/myapp-40",
            bytes: 943_718_400,
          },
          {
            id: "de300000-0000-4000-8000-000000000001",
            action: "kept" as const,
            reason: "phiên đang running",
            bytes: 0,
          },
        ],
      };
    },

    /*
     * Ba phiên mẫu phủ ba trạng thái màn danh sách phải vẽ khác nhau: đang
     * chạy (mở được live), đã xong, và chết cần người. Phiên đang chạy dùng
     * đúng id PHIEN_DEMO mà session-ctl trả về ở fixture mode — bấm "New
     * session" trên fixture là rơi vào trang live có chữ thật để xem.
     */
    async listRepos() {
      return [
        { slug: "blog", repo: "you/blog" },
        { slug: "myapp", repo: "you/myapp" },
      ];
    },

    /*
     * Doctor theo cảnh — cùng câu chuyện với các nguồn khác:
     * - vừa-cài → null ("doctor chưa từng chạy") — login rơi vào /setup;
     * - có-sự-cố → TRỘN xanh/đỏ + PAUSE bật: màn setup phải vẽ được cả mục
     *   hỏng kèm cách sửa lẫn banner nằm-im;
     * - còn lại → xanh toàn bộ: login về Overview như máy đã chạy ổn.
     */
    /** Palette "/" trên fixture: hai command mẫu — đủ để e2e kiểm ổn định. */
    async listCommands() {
      return [
        { name: "build", moTa: "Implement tasks incrementally — build, test, verify, commit." },
        { name: "plan", moTa: "Break work into small verifiable tasks." },
      ];
    },

    /** Số tài khoản dàn dựng — khớp các % mà fixture ClaudeSource vẫn vẽ. */
    async readClaudeUsage() {
      if (chuaChayLanNao(await currentScene())) return null;
      return {
        five_hour: { percent: 38, resets_at: "2026-08-17T12:14:00Z" },
        seven_day: { percent: 81, resets_at: "2026-08-20T10:00:00Z" },
        fetched_at: "2026-08-17T10:00:00Z",
      };
    },

    /** Cùng câu chuyện với readDoctor: cảnh xanh đã có token, cảnh khác chưa. */
    async readClaudeAuth() {
      const canh = await currentScene();
      if (chuaChayLanNao(canh) || canh === "co-su-co") return "none";
      return "token";
    },

    async readDoctor() {
      const canh = await currentScene();
      if (chuaChayLanNao(canh)) return null;
      if (canh === "co-su-co") {
        return {
          checked_at: "2026-08-18T09:30:00Z",
          ok: false,
          paused: true,
          checks: [
            { id: "pat", ok: true, detail: "fine-grained PAT" },
            { id: "claude", ok: false, detail: "chưa có auth — lấy link login ở /setup" },
            { id: "repo:myapp", ok: true, detail: "branch protection bật trên main" },
            {
              id: "repo:blog",
              ok: false,
              detail: "CHƯA có branch protection trên main — push thẳng main đang mở",
            },
            { id: "may-sach", ok: true, detail: "không thấy SSH key / AWS / kube / GPG" },
            { id: "linger", ok: false, detail: "chưa bật — chạy: loginctl enable-linger bee" },
            { id: "reaper", ok: true, detail: "bee-reaper.timer đang chạy" },
            {
              id: "web",
              ok: false,
              detail:
                "cổng 3210 do tiến trình khác giữ (pid 4127, user ducba), KHÔNG phải bee-web — thứ bạn thấy trên cổng này là web của người khác",
            },
            { id: "dia", ok: true, detail: "/srv/bee ghi được" },
          ],
        };
      }
      return {
        checked_at: "2026-08-18T09:30:00Z",
        ok: true,
        paused: false,
        checks: [
          { id: "pat", ok: true, detail: "fine-grained PAT" },
          { id: "claude", ok: true, detail: "token từ claude setup-token (claude.env)" },
          { id: "repo:myapp", ok: true, detail: "branch protection bật trên main" },
          { id: "repo:blog", ok: true, detail: "branch protection bật trên main" },
          { id: "may-sach", ok: true, detail: "không thấy SSH key / AWS / kube / GPG" },
          { id: "linger", ok: true, detail: "bật" },
          { id: "reaper", ok: true, detail: "bee-reaper.timer đang chạy" },
          { id: "web", ok: true, detail: "bee-web active · 127.0.0.1:3210 trả 307 · restart 0 lần" },
          { id: "dia", ok: true, detail: "/srv/bee ghi được" },
        ],
      };
    },

    async listSessions(): Promise<BeeSession[]> {
      if (chuaChayLanNao(await currentScene())) return [];
      return [phienDemoDangChay(), phienDemoXong(), phienDemoChet()];
    },

    async readSession(id): Promise<BeeSession | null> {
      const ds = await this.listSessions();
      return ds.find((p) => p.id === id) ?? null;
    },

    async listSessionEvidence() {
      // Fixture has no per-session evidence store — the demo node stays a
      // real-machine feature; the review panel is covered separately below.
      return [];
    },

    async findArtifactEvidence(_repo, _kind, _number) {
      // Fixture: reuse the demo shots that already live in fixtures/evidence
      // so the review panel shows real images without a machine.
      const goc = "/api/evidence/myapp/45/9f3c1ab";
      return {
        sessionId: "de300000-0000-4000-8000-000000000001",
        files: [
          {
            name: "loc-don-theo-trang-thai-1.png",
            url: `${goc}/shots/loc-don-theo-trang-thai-1.png`,
            loai: "image",
          },
          {
            name: "giu-bo-loc-khi-tai-lai.gif",
            url: `${goc}/giu-bo-loc-khi-tai-lai.gif`,
            loai: "image",
          },
        ],
      };
    },

    async sessionArtifacts(id): Promise<BeeArtifact[]> {
      if (chuaChayLanNao(await currentScene())) return [];
      // Phiên đang chạy mới có issue; phiên xong có đủ issue + PR — canvas
      // trên fixture phải cho thấy cả hai hình dạng.
      if (id === "de300000-0000-4000-8000-000000000001") {
        return [
          {
            kind: "issue",
            url: "https://github.com/you/myapp/issues/41",
            number: 41,
            ts: "2026-08-17T10:02:00Z",
            title: "Add CSV export to the report screen",
          },
        ];
      }
      if (id === "de300000-0000-4000-8000-000000000002") {
        return [
          {
            kind: "issue",
            url: "https://github.com/you/myapp/issues/40",
            number: 40,
            ts: "2026-08-13T09:01:00Z",
            title: "Legal pages share one layout",
          },
          {
            kind: "pr",
            url: "https://github.com/you/myapp/pull/123",
            number: 123,
            ts: "2026-08-13T09:10:00Z",
            title: "Extract legal-document layout, add tests",
          },
        ];
      }
      return [];
    },

    async sessionPreview(id): Promise<string | null> {
      if (id === "de300000-0000-4000-8000-000000000001") {
        return "Running the test suite before opening the PR — 3 files changed so far.";
      }
      if (id === "de300000-0000-4000-8000-000000000002") {
        return "Done. Draft PR #123 is up — both pages now share one layout component.";
      }
      if (id === "de300000-0000-4000-8000-000000000003") {
        return "I could not reproduce the encoding issue locally; need a sample feed.";
      }
      return null;
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
    worktree: true,
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
    worktree: true,
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
    worktree: true,
    status: "failed",
    created_at: "2026-08-16T22:10:00Z",
    started_at: "2026-08-16T22:10:03Z",
    ended_at: "2026-08-16T23:41:00Z",
    attempt: 2,
    needs_human: true,
  };
}
