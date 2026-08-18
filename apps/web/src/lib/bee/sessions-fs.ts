import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { laIdPhien } from "./session-id";
import type { BeeArtifact, BeeSession, PhaCuaPhien, TrangThaiPhien } from "./types";

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
    status,
    created_at: typeof s.created_at === "string" ? s.created_at : null,
    started_at: typeof meta.started_at === "string" ? meta.started_at : null,
    ended_at: typeof meta.ended_at === "string" ? meta.ended_at : null,
    attempt: typeof meta.attempt === "number" ? meta.attempt : 0,
    needs_human: meta.needs_human === true,
  };
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
    });
  }
  return ra;
}
