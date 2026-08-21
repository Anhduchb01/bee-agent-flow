import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { laIdPhien } from "./session-id";
import type {
  BeeArtifact,
  BeeEvidenceTepTin,
  BeeRepoDangKy,
  BeeSession,
  PhaCuaPhien,
  TrangThaiPhien,
} from "./types";

/**
 * Đọc `sessions/` trên đĩa. Cùng bài với runs-fs: JSON từ đĩa là `unknown`,
 * thu hẹp từng trường bằng tay — meta.json do bash ghi, và một dòng jq sai
 * ở runner không được phép làm trắng cả danh sách phiên.
 */

function laObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

async function docJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

const TRANG_THAI: readonly TrangThaiPhien[] = ["starting", "running", "done", "stopped", "failed"];

export async function docPhienTrong(root: string, id: string): Promise<BeeSession | null> {
  if (!laIdPhien(id)) return null;
  const sdir = path.join(root, "sessions", id);

  const s = await docJson(path.join(sdir, "session.json"));
  if (!laObject(s)) return null;
  if (typeof s.slug !== "string" || typeof s.repo !== "string") return null;

  // meta.json chưa tồn tại = runner chưa mở sổ = "starting". Đây là trạng
  // thái thật ngay sau khi bấm nút, không phải lỗi đọc.
  const m = await docJson(path.join(sdir, "meta.json"));
  const meta = laObject(m) ? m : {};

  const statusTho = typeof meta.status === "string" ? meta.status : "starting";
  const status: TrangThaiPhien = (TRANG_THAI as readonly string[]).includes(statusTho)
    ? (statusTho as TrangThaiPhien)
    : "starting";

  const phase: PhaCuaPhien = s.phase === "work" ? "work" : "interview";

  return {
    id,
    slug: s.slug,
    num: typeof s.num === "number" ? s.num : 0,
    repo: s.repo,
    title: typeof s.title === "string" ? s.title : null,
    phase,
    // Chỉ `false` tường minh mới là phiên chat — session.json cũ không có
    // trường này và chúng đều là phiên có worktree.
    worktree: s.worktree !== false,
    // Phiên cũ không có mode = auto (hành vi V1). Giá trị lạ cũng về auto.
    mode: s.mode === "plan" || s.mode === "edits" || s.mode === "manual" ? s.mode : "auto",
    status,
    created_at: typeof s.created_at === "string" ? s.created_at : null,
    started_at: typeof meta.started_at === "string" ? meta.started_at : null,
    ended_at: typeof meta.ended_at === "string" ? meta.ended_at : null,
    attempt: typeof meta.attempt === "number" ? meta.attempt : 0,
    needs_human: meta.needs_human === true,
  };
}

/**
 * Repo đã đăng ký = file `repos.d/<slug>.env` có dòng `REPO=owner/name`.
 * Cùng nguồn mà doctor.sh kiểm branch protection — một danh sách, hai người đọc.
 */
export async function lietKeRepoTrong(root: string): Promise<BeeRepoDangKy[]> {
  let files: string[];
  try {
    files = await fs.readdir(path.join(root, "repos.d"));
  } catch {
    return [];
  }
  const ra: BeeRepoDangKy[] = [];
  for (const f of files) {
    if (!f.endsWith(".env")) continue;
    const slug = f.slice(0, -4);
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    let text: string;
    try {
      text = await fs.readFile(path.join(root, "repos.d", f), "utf8");
    } catch {
      continue;
    }
    const m = text.match(/^REPO=["']?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)["']?\s*$/m);
    if (m) ra.push({ slug, repo: m[1] });
  }
  return ra.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function lietKePhienTrong(root: string): Promise<BeeSession[]> {
  let ids: string[];
  try {
    ids = await fs.readdir(path.join(root, "sessions"));
  } catch {
    return [];
  }
  const phien = await Promise.all(ids.map((id) => docPhienTrong(root, id)));
  return phien
    .filter((p): p is BeeSession => p !== null)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

export function duongDanRunTrong(root: string, id: string): string | null {
  if (!laIdPhien(id)) return null;
  return path.join(root, "sessions", id, "run.jsonl");
}

/**
 * Trích artifact từ run.jsonl — quét dòng `bee_artifact` do skill ghi.
 * Cùng allowlist với parse-events: kind ∈ {issue, pr}, url phải là GitHub.
 * File vài MB đọc một lần là chấp nhận được cho n phiên hiện tại; nếu
 * run.jsonl có trần theo byte (spec session-first §11) thì đây cũng có trần.
 */
export async function docArtifactsTrong(root: string, id: string): Promise<BeeArtifact[]> {
  const file = duongDanRunTrong(root, id);
  if (!file) return [];
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return [];
  }
  const ra: BeeArtifact[] = [];
  for (const dong of text.split("\n")) {
    // Lọc rẻ trước khi JSON.parse — file dài, dòng artifact hiếm.
    if (!dong.includes('"bee_artifact"')) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(dong);
    } catch {
      continue;
    }
    if (!laObject(raw) || raw.type !== "bee_artifact") continue;
    if (raw.kind !== "issue" && raw.kind !== "pr") continue;
    if (typeof raw.url !== "string" || !raw.url.startsWith("https://github.com/")) continue;
    ra.push({
      kind: raw.kind,
      url: raw.url,
      number: typeof raw.number === "number" ? raw.number : null,
      ts: typeof raw.ts === "string" ? raw.ts : null,
      title: typeof raw.title === "string" ? raw.title.slice(0, 140) : null,
    });
  }
  return ra;
}

/**
 * Câu cuối agent nói — preview một dòng cho node canvas. Đi từ CUỐI file lên,
 * dừng ở message assistant đầu tiên có text: phiên dài không bắt đọc cả file
 * chỉ để lấy một câu.
 */
export async function docCauCuoiTrong(root: string, id: string): Promise<string | null> {
  const file = duongDanRunTrong(root, id);
  if (!file) return null;
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  const dongs = text.split("\n");
  for (let i = dongs.length - 1; i >= 0; i -= 1) {
    if (!dongs[i].includes('"assistant"')) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(dongs[i]);
    } catch {
      continue;
    }
    if (!laObject(raw) || raw.type !== "assistant" || !laObject(raw.message)) continue;
    const content = raw.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (laObject(block) && block.type === "text" && typeof block.text === "string") {
        const gon = block.text.trim().replace(/\s+/g, " ");
        if (gon !== "") return gon.slice(0, 140);
      }
    }
  }
  return null;
}

function loaiTep(name: string): BeeEvidenceTepTin["loai"] {
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return "image";
  if (/\.(webm|mp4)$/i.test(name)) return "video";
  return "khac";
}

/** List one session's evidence dir, typed and url'd for the web. */
export async function docEvidenceTrong(root: string, id: string): Promise<BeeEvidenceTepTin[]> {
  if (!laIdPhien(id)) return [];
  let names: string[];
  try {
    names = await fs.readdir(path.join(root, "sessions", id, "evidence"));
  } catch {
    return [];
  }
  return names.sort().map((n) => ({
    name: n,
    url: `/api/evidence/session/${id}/${encodeURIComponent(n)}`,
    loai: loaiTep(n),
  }));
}

/**
 * Evidence for an issue/PR (V2.1): find the session whose run.jsonl logged
 * this artifact, then list its evidence dir. The review panel gets real
 * screenshots/videos next to the diff — no GitHub round-trip.
 */
export async function timEvidenceChoArtifact(
  root: string,
  repo: string,
  kind: "issue" | "pr",
  number: number,
): Promise<{ sessionId: string; files: BeeEvidenceTepTin[] } | null> {
  for (const phien of await lietKePhienTrong(root)) {
    const arts = await docArtifactsTrong(root, phien.id);
    const trung = arts.some(
      (a) =>
        a.kind === kind &&
        a.number === number &&
        a.url.startsWith(`https://github.com/${repo}/`),
    );
    if (!trung) continue;
    return { sessionId: phien.id, files: await docEvidenceTrong(root, phien.id) };
  }
  return null;
}

/** Last bee_preview line a session logged (V2.3) — the running preview's coords. */
export interface BeePreviewGhiSo {
  sessionId: string;
  unit: string;
  url: string;
  port: number;
  ts: string | null;
}

export async function docPreviewTrong(root: string, id: string): Promise<BeePreviewGhiSo | null> {
  const file = duongDanRunTrong(root, id);
  if (!file) return null;
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  let cuoi: BeePreviewGhiSo | null = null;
  for (const dong of text.split("\n")) {
    if (!dong.includes('"bee_preview"')) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(dong);
    } catch {
      continue;
    }
    if (!laObject(raw) || raw.type !== "bee_preview") continue;
    if (typeof raw.unit !== "string" || !/^bee-preview-[a-z0-9][a-z0-9-]*$/.test(raw.unit)) continue;
    if (typeof raw.url !== "string" || !raw.url.startsWith("https://")) continue;
    if (typeof raw.port !== "number" || !Number.isInteger(raw.port)) continue;
    cuoi = {
      sessionId: id,
      unit: raw.unit,
      url: raw.url,
      port: raw.port,
      ts: typeof raw.ts === "string" ? raw.ts : null,
    };
  }
  return cuoi;
}
