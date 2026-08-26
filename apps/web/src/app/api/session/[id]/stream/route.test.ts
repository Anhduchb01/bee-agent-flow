import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";

import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));
vi.mock("@/lib/bee", () => ({ getBee: vi.fn() }));

const ID = "de300000-0000-4000-8000-000000000001";

let dir = "";
let runFile = "";

/** Wire the mocked BeeSource to a real run.jsonl on disk — readMore is real. */
function mockBee(input: { file?: string | null; status?: string }) {
  vi.mocked(getBee).mockReturnValue({
    sessionRunPath: () => (input.file !== undefined ? input.file : runFile),
    readSession: async () => ({ id: ID, status: input.status ?? "running" }),
  } as unknown as ReturnType<typeof getBee>);
}

function goi(id: string, lastEventId?: string): Promise<Response> {
  const req = new Request(`http://x/api/session/${id}/stream`, {
    headers: lastEventId === undefined ? {} : { "last-event-id": lastEventId },
  });
  return GET(req, { params: Promise.resolve({ id }) });
}

interface Frame {
  id: number;
  data: string;
}

/** Read SSE frames off the response until `until` says stop, then cancel. */
async function readFrames(
  res: Response,
  until: (frames: Frame[]) => boolean,
  timeoutMs = 4000,
): Promise<Frame[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const frames: Frame[] = [];
  let buf = "";
  const timedOut = Date.now() + timeoutMs;
  try {
    while (!until(frames) && Date.now() < timedOut) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((r) =>
          setTimeout(() => r({ done: true, value: undefined }), Math.max(0, timedOut - Date.now())),
        ),
      ]);
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      let cat = buf.indexOf("\n\n");
      while (cat >= 0) {
        const khoi = buf.slice(0, cat);
        buf = buf.slice(cat + 2);
        const id = Number(/^id: (\d+)$/m.exec(khoi)?.[1] ?? "-1");
        const data = /^data: (.*)$/m.exec(khoi)?.[1] ?? "";
        frames.push({ id, data });
        cat = buf.indexOf("\n\n");
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return frames;
}

describe("GET /api/session/[id]/stream", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-sse-"));
    runFile = path.join(dir, "run.jsonl");
    vi.mocked(getActor).mockResolvedValue({ login: "duc" } as Awaited<ReturnType<typeof getActor>>);
    mockBee({});
  });
  afterEach(async () => {
    vi.clearAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("401 without an actor — the stream is private", async () => {
    vi.mocked(getActor).mockResolvedValue(null);
    expect((await goi(ID)).status).toBe(401);
  });

  it("400 on a dirty id — never near a path or unit name", async () => {
    expect((await goi("../../etc")).status).toBe(400);
  });

  it("404 when the session does not exist", async () => {
    mockBee({ file: null });
    expect((await goi(ID)).status).toBe(404);
  });

  it("replays existing lines as SSE frames; id = byte offset AFTER the line", async () => {
    await fs.writeFile(runFile, '{"n":1}\n{"n":2}\n');
    const res = await goi(ID);

    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const frames = await readFrames(res, (f) => f.length >= 2);
    expect(frames.map((f) => f.data)).toEqual(['{"n":1}', '{"n":2}']);
    // Both replay frames carry the offset of the replay's end (resume point).
    expect(frames[0]?.id).toBe(Buffer.byteLength('{"n":1}\n{"n":2}\n'));
  });

  it("long history: bee_replayed says how many lines were skipped, then the tail", async () => {
    const line = Array.from({ length: 205 }, (_, i) => `{"n":${i}}`);
    await fs.writeFile(runFile, line.join("\n") + "\n");
    const res = await goi(ID);

    const frames = await readFrames(res, (f) => f.length >= 201);
    expect(JSON.parse(frames[0]!.data)).toEqual({ type: "bee_replayed", skipped: 5 });
    expect(frames).toHaveLength(201); // 1 marker + 200 tail lines
    expect(frames[1]?.data).toBe('{"n":5}');
    expect(frames[200]?.data).toBe('{"n":204}');
  });

  it("Last-Event-ID resumes from that byte offset — no duplicates after reconnect", async () => {
    const head = '{"n":1}\n';
    await fs.writeFile(runFile, head + '{"n":2}\n');
    const res = await goi(ID, String(Buffer.byteLength(head)));

    const frames = await readFrames(res, (f) => f.length >= 1);
    expect(frames.map((f) => f.data)).toEqual(['{"n":2}']);
  });

  it("session no longer running → flushes the rest, sends bee_done, CLOSES", async () => {
    await fs.writeFile(runFile, '{"n":1}\n');
    mockBee({ status: "done" });
    const res = await goi(ID);

    // The meta check runs every 8 ticks × 250ms ≈ 2s — wait it out for real.
    const frames = await readFrames(res, (f) => f.some((x) => x.data.includes("bee_done")));
    const tail = frames.at(-1);
    expect(JSON.parse(tail!.data)).toEqual({ type: "bee_done", status: "done" });
  }, 8000);
});
