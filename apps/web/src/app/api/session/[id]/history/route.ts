import "server-only";

import fs from "node:fs/promises";

import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";
import { isSessionId } from "@/lib/bee/session-id";

/**
 * Older `run.jsonl` lines, a page at a time.
 *
 * The SSE stream replays only the last 200 lines and says how many it skipped
 * — which keeps attaching to a long session cheap, but left everything above
 * that unreachable. The chat could not be scrolled back to its first message,
 * and nothing offered a way to ask for it.
 *
 * Paging happens HERE rather than by raising the replay cap: a session that
 * ran for hours would otherwise push tens of thousands of lines at every
 * attach, on a phone, before the first frame paints.
 *
 * `from` counts lines from the START of the file, so a page is stable while
 * the session keeps appending — an offset counted from the end would shift
 * under the reader. What it is NOT stable against is the reaper trimming the
 * head of the file (spec §11, 20MB): those lines are gone from disk, and the
 * stream already reports that separately as `bee_truncated`.
 */

const MAX_LIMIT = 500;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("forbidden", { status: 401 });

  const { id } = await params;
  if (!isSessionId(id)) return new Response("bad id", { status: 400 });

  const file = getBee().sessionRunPath(id);
  if (!file) return new Response("no such session", { status: 404 });

  const url = new URL(req.url);
  const from = Math.max(0, Math.floor(Number(url.searchParams.get("from") ?? "0")) || 0);
  const asked = Math.floor(Number(url.searchParams.get("limit") ?? "200")) || 200;
  const limit = Math.min(MAX_LIMIT, Math.max(1, asked));

  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    // No file yet is not an error: a session can be asked about before its
    // first line lands.
    return Response.json({ lines: [], from: 0, total: 0, hasMore: false });
  }

  // A trailing newline must not become an empty "line" that the parser then
  // has to treat as junk.
  const all = text.split("\n").filter((l) => l !== "");
  const lines = all.slice(from, from + limit);

  return Response.json(
    { lines, from, total: all.length, hasMore: from + lines.length < all.length },
    // Live file: a cached page would hide lines the session just wrote.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
