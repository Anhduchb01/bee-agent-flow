import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { harvestClaudeUsage } from "./machine-ctl";
import { parseClaudeRateLimit, parseRecentLine } from "./parse";

let dir = "";

async function phien(id: string, input: {
  usage?: object | null;
  rateLimit?: object;
  meta?: object;
  session?: object;
}) {
  const s = path.join(dir, "sessions", id);
  await fs.mkdir(s, { recursive: true });
  const lines = ['{"type":"system","subtype":"init"}'];
  if (input.rateLimit) {
    lines.push(JSON.stringify({ type: "rate_limit_event", rate_limit_info: input.rateLimit }));
  }
  await fs.writeFile(path.join(s, "run.jsonl"), lines.join("\n") + "\n");
  if (input.usage !== null) {
    await fs.writeFile(path.join(s, "usage.json"), JSON.stringify(input.usage ?? {}));
  }
  await fs.writeFile(
    path.join(s, "session.json"),
    JSON.stringify({ id, slug: "myapp", num: 1, repo: "you/myapp", ...input.session }),
  );
  await fs.writeFile(
    path.join(s, "meta.json"),
    JSON.stringify({ status: "done", started_at: "2026-08-19T01:00:00Z", ended_at: "2026-08-19T02:00:00Z", ...input.meta }),
  );
}

describe("harvestClaudeUsage — refresh = re-harvest real session data into state/", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-harvest-"));
    process.env.BEE_SRV = dir;
    process.env.BEE_SOURCE = "disk";
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    delete process.env.BEE_SOURCE;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes state files the EXISTING parsers accept — same door the panel reads", async () => {
    await phien("aa000000-0000-4000-8000-000000000001", {
      rateLimit: {
        status: "allowed",
        resetsAt: 1787068800,
        rateLimitType: "five_hour",
        overageStatus: "rejected",
        isUsingOverage: false,
      },
      usage: {
        type: "result",
        num_turns: 2,
        duration_ms: 5000,
        modelUsage: {
          "claude-fable-5": {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadInputTokens: 10,
            cacheCreationInputTokens: 5,
            costUSD: 0.12,
          },
        },
      },
    });

    const ket = await harvestClaudeUsage();
    expect(ket.ok).toBe(true);

    const rl = parseClaudeRateLimit(
      await fs.readFile(path.join(dir, "state", "claude-rate-limit.json"), "utf8"),
    );
    expect(rl).not.toBeNull();
    expect(rl!.resetsAt).toBe(1787068800);
    expect(rl!.rateLimitType).toBe("five_hour");

    const rows = (await fs.readFile(path.join(dir, "state", "recent.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map(parseRecentLine);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      repo: "you/myapp",
      result: "done",
      turns: 2,
      duration_s: 5,
      at: "2026-08-19T02:00:00Z",
      tokens_in: 100,
      tokens_out: 50,
      tokens_cache_read: 10,
      tokens_cache_write: 5,
      cost_usd: 0.12,
    });
  });

  it("sessions without usage.json still contribute their rate_limit_event", async () => {
    await phien("bb000000-0000-4000-8000-000000000002", {
      usage: null,
      rateLimit: {
        status: "allowed_warning",
        resetsAt: 1787119200,
        rateLimitType: "weekly",
        overageStatus: "rejected",
        isUsingOverage: false,
      },
    });

    await harvestClaudeUsage();
    const rl = parseClaudeRateLimit(
      await fs.readFile(path.join(dir, "state", "claude-rate-limit.json"), "utf8"),
    );
    expect(rl!.rateLimitType).toBe("weekly");
    const recent = await fs.readFile(path.join(dir, "state", "recent.jsonl"), "utf8");
    expect(recent.trim()).toBe("");
  });

  it("no sessions at all → ok, no rate-limit file, empty recent", async () => {
    const ket = await harvestClaudeUsage();
    expect(ket.ok).toBe(true);
    await expect(fs.access(path.join(dir, "state", "claude-rate-limit.json"))).rejects.toThrow();
  });
});
