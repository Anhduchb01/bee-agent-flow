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

function mockBee(file?: string | null) {
  vi.mocked(getBee).mockReturnValue({
    sessionRunPath: () => (file !== undefined ? file : runFile),
  } as unknown as ReturnType<typeof getBee>);
}

function call(id: string, query = ""): Promise<Response> {
  const req = new Request(`http://x/api/session/${id}/history${query}`);
  return GET(req, { params: Promise.resolve({ id }) });
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-hist-"));
  runFile = path.join(dir, "run.jsonl");
  vi.mocked(getActor).mockResolvedValue({ login: "pm-linh" } as never);
  mockBee();
});
afterEach(async () => {
  vi.clearAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

/** n lines, each identifiable, so a page's CONTENT can be checked. */
async function seed(n: number) {
  await fs.writeFile(
    runFile,
    Array.from({ length: n }, (_, i) => JSON.stringify({ type: "bee_lifecycle", msg: `L${i}` }))
      .join("\n") + "\n",
  );
}

describe("session history — the lines the stream did not replay", () => {
  it("refuses someone not signed in before touching the disk", async () => {
    vi.mocked(getActor).mockResolvedValue(null as never);
    expect((await call(ID)).status).toBe(401);
  });

  it("a malformed id is 400, not a path read", async () => {
    expect((await call("../../etc")).status).toBe(400);
  });

  it("an unknown session is 404", async () => {
    mockBee(null);
    expect((await call(ID)).status).toBe(404);
  });

  it("hands back a page from the START, so it is stable while the session appends", async () => {
    await seed(500);
    const body = (await (await call(ID, "?from=100&limit=50")).json()) as {
      lines: string[];
      total: number;
      hasMore: boolean;
    };

    expect(body.lines).toHaveLength(50);
    expect(JSON.parse(body.lines[0]!).msg).toBe("L100");
    expect(JSON.parse(body.lines[49]!).msg).toBe("L149");
    expect(body.total).toBe(500);
    expect(body.hasMore).toBe(true);
  });

  it("says when a page reaches the end, so the client stops asking", async () => {
    await seed(120);
    const body = (await (await call(ID, "?from=100&limit=200")).json()) as {
      lines: string[];
      hasMore: boolean;
    };
    expect(body.lines).toHaveLength(20);
    expect(body.hasMore).toBe(false);
  });

  it("the first page is reachable — that is the whole point", async () => {
    await seed(300);
    const body = (await (await call(ID, "?from=0&limit=10")).json()) as { lines: string[] };
    expect(JSON.parse(body.lines[0]!).msg).toBe("L0");
  });

  it("caps limit so one request cannot ask for the whole file", async () => {
    await seed(2000);
    const body = (await (await call(ID, "?from=0&limit=99999")).json()) as { lines: string[] };
    expect(body.lines.length).toBeLessThanOrEqual(500);
  });

  it("junk params fall back to a sane page instead of NaN", async () => {
    await seed(30);
    const body = (await (await call(ID, "?from=abc&limit=xyz")).json()) as {
      lines: string[];
      from: number;
    };
    expect(body.from).toBe(0);
    expect(body.lines).toHaveLength(30);
  });

  it("a negative from cannot walk off the front", async () => {
    await seed(30);
    const body = (await (await call(ID, "?from=-50&limit=5")).json()) as { from: number };
    expect(body.from).toBe(0);
  });

  it("no file yet reads as empty, not as an error — a session can be asked early", async () => {
    const body = (await (await call(ID)).json()) as { lines: string[]; total: number };
    expect(body.lines).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("a trailing newline does not become an empty line for the parser to choke on", async () => {
    await fs.writeFile(runFile, '{"type":"bee_lifecycle","msg":"one"}\n');
    const body = (await (await call(ID)).json()) as { lines: string[]; total: number };
    expect(body.total).toBe(1);
    expect(body.lines).toHaveLength(1);
  });

  it("is never cached — a page from a live file must not be stale", async () => {
    await seed(10);
    const res = await call(ID);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});
