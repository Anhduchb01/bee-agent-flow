import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { readClaudeAuthFrom, readDoctorFrom } from "./doctor-fs";
import { listEvidenceIn, readEvidenceFileIn } from "./evidence-fs";
import { listRunsIn, readRunIn } from "./runs-fs";
import {
  docArtifactsTrong,
  docCauCuoiTrong,
  docPhienTrong,
  duongDanRunTrong,
  lietKePhienTrong,
  lietKeRepoTrong,
} from "./sessions-fs";
import { parseClaudeRateLimit, parseRecentLine, parseStatus } from "./parse";
import type { BeeClaudeRateLimit, BeeRecentRun, BeeSource, StatusRead } from "./types";

/**
 * Đọc `/srv/bee/` thật. Chỉ đọc — app chạy dưới user `bee-web`, và mọi cách để
 * bảo máy làm gì đó đều đi qua GitHub rồi chờ reconciler nhặt.
 *
 * Phần này chỉ nghiệm thu được ở pha B, khi có một máy đã cài xong: hình dạng
 * `status.json` thật khớp `types.ts` là một trong bốn thứ fixture không chứng
 * minh được. Mọi lệch phát hiện lúc đó phải sửa ở `lib/`, không phải ở màn hình.
 */
/**
 * Đọc `process.env` ở MỖI LỜI GỌI, không phải một lần lúc nạp module.
 *
 * Bản cũ ghim vào một hằng số ở đầu file, nên `BEE_SRV` đặt sau lúc import
 * không có tác dụng gì. Bài test "BEE_SOURCE=disk đọc chỗ khác" vì thế chưa bao
 * giờ kiểm điều nó nói: nó vẫn trỏ vào `/srv/bee`, và nó xanh chỉ vì máy CI
 * không có thư mục đó. Trên một máy đã cài bee thật thì nó đọc dữ liệu thật và
 * đỏ — đúng lúc ta cần nó nhất.
 */
function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

export function createDiskBeeSource(): BeeSource {
  return {
    async readStatus(): Promise<StatusRead> {
      const file = path.join(root(), "public", "status.json");
      let text: string;
      try {
        text = await fs.readFile(file, "utf8");
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          return { ok: false, reason: "missing", detail: `${file} does not exist` };
        }
        return { ok: false, reason: "unreadable", detail: `${file}: ${code ?? String(e)}` };
      }
      return parseStatus(text);
    },

    async readRecent(limit = 20): Promise<BeeRecentRun[]> {
      let text: string;
      try {
        text = await fs.readFile(path.join(root(), "state", "recent.jsonl"), "utf8");
      } catch {
        return [];
      }
      return text
        .split("\n")
        .map(parseRecentLine)
        .filter((r): r is BeeRecentRun => r !== null)
        .reverse()
        .slice(0, limit);
    },

    async readClaudeRateLimit(): Promise<BeeClaudeRateLimit | null> {
      // Vắng mặt là chuyện thường: file chỉ xuất hiện khi Claude CLI thực sự
      // phát ra một `rate_limit_event`, mà không phải lần chạy nào cũng có.
      try {
        return parseClaudeRateLimit(
          await fs.readFile(path.join(root(), "state", "claude-rate-limit.json"), "utf8"),
        );
      } catch {
        return null;
      }
    },

    listRuns: (slug, num) => listRunsIn(path.join(root(), "runs"), slug, num),
    readRun: (slug, num, dir) => readRunIn(path.join(root(), "runs"), slug, num, dir),

    listEvidence: (slug, num) => listEvidenceIn(path.join(root(), "evidence"), slug, num),
    readEvidenceFile: (segments) => readEvidenceFileIn(path.join(root(), "evidence"), segments),

    readDoctor: () => readDoctorFrom(root()),
    readClaudeAuth: () => readClaudeAuthFrom(root()),
    listRepos: () => lietKeRepoTrong(root()),
    listSessions: () => lietKePhienTrong(root()),
    readSession: (id) => docPhienTrong(root(), id),
    sessionArtifacts: (id) => docArtifactsTrong(root(), id),
    sessionPreview: (id) => docCauCuoiTrong(root(), id),
    sessionRunPath: (id) => duongDanRunTrong(root(), id),
  };
}
