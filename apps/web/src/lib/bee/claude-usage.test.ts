import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readClaudeUsageFrom } from "./doctor-fs";
import { fetchClaudeAccountUsage } from "./machine-ctl";

let dir = "";

describe("account usage — fetch from the oauth endpoint, read back narrowed", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-acc-"));
    process.env.BEE_SRV = dir;
    process.env.BEE_SOURCE = "disk";
    await fs.writeFile(path.join(dir, "claude.env"), "CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-abc\n");
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    delete process.env.BEE_SOURCE;
    vi.unstubAllGlobals();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("fetches with the machine token and writes state/claude-usage.json", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          five_hour: { utilization: 9.0, resets_at: "2026-08-19T11:19:59Z" },
          seven_day: { utilization: 27.0, resets_at: "2026-08-21T06:59:59Z" },
          extra_junk: { ignored: true },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await fetchClaudeAccountUsage();
    expect(outcome.ok).toBe(true);

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain("api.anthropic.com/api/oauth/usage");
    expect((call[1].headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-ant-oat01-abc",
    );

    const reader = await readClaudeUsageFrom(dir);
    expect(reader).toMatchObject({
      five_hour: { percent: 9, resets_at: "2026-08-19T11:19:59Z" },
      seven_day: { percent: 27, resets_at: "2026-08-21T06:59:59Z" },
    });
    expect(typeof reader!.fetched_at).toBe("string");
  });

  it("429 comes back as a message, and stale state is left untouched", async () => {
    await fs.mkdir(path.join(dir, "state"), { recursive: true });
    await fs.writeFile(path.join(dir, "state", "claude-usage.json"), JSON.stringify({
      five_hour: { percent: 5, resets_at: null }, seven_day: null, fetched_at: "old",
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));

    const outcome = await fetchClaudeAccountUsage();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain("429");
    expect((await readClaudeUsageFrom(dir))!.five_hour!.percent).toBe(5);
  });

  it("no token anywhere → clear message, no fetch", async () => {
    await fs.rm(path.join(dir, "claude.env"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await fetchClaudeAccountUsage({ credentialsFile: path.join(dir, "nope.json") });
    expect(outcome.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("thiếu HOME → không đi đọc `.claude/` TƯƠNG ĐỐI của thư mục làm việc", async () => {
    // `path.join("", ".claude", …)` ra một đường dẫn tương đối. Trước đây
    // thiếu HOME là lặng lẽ đọc credential của bất cứ thư mục nào tiến trình
    // đang đứng — sai file, và không ai biết. (Cũng chính là chỗ Turbopack
    // cảnh báo "dynamic filesystem access" rồi kéo cả project vào standalone.)
    await fs.rm(path.join(dir, "claude.env"));
    const fakeCwd = path.join(dir, "cwd-fake");
    await fs.mkdir(path.join(fakeCwd, ".claude"), { recursive: true });
    await fs.writeFile(
      path.join(fakeCwd, ".claude", ".credentials.json"),
      JSON.stringify({ claudeAiOauth: { accessToken: "do-not-use-this-token" } }),
    );
    const cwdCu = process.cwd();
    const homeCu = process.env.HOME;
    process.chdir(fakeCwd);
    delete process.env.HOME;
    try {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const outcome = await fetchClaudeAccountUsage();
      expect(outcome.ok).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      process.chdir(cwdCu);
      if (homeCu === undefined) delete process.env.HOME;
      else process.env.HOME = homeCu;
    }
  });

  it("readClaudeUsageFrom: missing or corrupt file → null", async () => {
    expect(await readClaudeUsageFrom(path.join(dir, "no-such"))).toBeNull();
    await fs.mkdir(path.join(dir, "state"), { recursive: true });
    await fs.writeFile(path.join(dir, "state", "claude-usage.json"), "{broken");
    expect(await readClaudeUsageFrom(dir)).toBeNull();
  });
});
