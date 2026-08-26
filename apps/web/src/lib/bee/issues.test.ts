import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchRepoIssues, resetIssuesCache } from "./issues";

/** The injected gh runner: typing the mock keeps `.mock.calls[0][0]` checkable. */
type RunGh = (args: string[]) => Promise<{ stdout: string }>;

let dir = "";

const ROW = {
  number: 41,
  title: "Add CSV export",
  state: "OPEN",
  url: "https://github.com/you/myapp/issues/41",
  labels: [{ name: "enhancement" }],
  assignees: [{ login: "Anhduchb01" }],
  createdAt: "2026-08-17T09:55:00Z",
  updatedAt: "2026-08-17T10:02:00Z",
};

async function registered(repo: string) {
  await fs.mkdir(path.join(dir, "repos.d"), { recursive: true });
  await fs.writeFile(path.join(dir, "repos.d", "myapp.env"), `REPO=${repo}\n`);
}

describe("fetchRepoIssues — external data crossing into the app", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-issues-"));
    process.env.BEE_SRV = dir;
    process.env.BEE_SOURCE = "disk";
    resetIssuesCache();
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    delete process.env.BEE_SOURCE;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads a registered repo's issues and sorts them newest number first", async () => {
    await registered("you/myapp");
    const runGh = vi.fn<RunGh>(async () => ({
      stdout: JSON.stringify([ROW, { ...ROW, number: 44 }]),
    }));

    const { issues, err } = await fetchRepoIssues("you/myapp", { runGh });
    expect(err).toBeNull();
    expect(issues.map((i) => i.number)).toEqual([44, 41]);
    expect(issues[1]).toMatchObject({ labels: ["enhancement"], assignees: ["Anhduchb01"] });
    // The state filter must be "all": a board without Done is not a board.
    expect(runGh.mock.calls[0]?.[0]).toContain("all");
  });

  it("refuses an unregistered repo — gh never runs for it", async () => {
    const runGh = vi.fn<RunGh>();
    const { issues, err } = await fetchRepoIssues("someone/else", { runGh });
    expect(issues).toEqual([]);
    expect(err).toMatch(/not a registered repo/);
    expect(runGh).not.toHaveBeenCalled();
  });

  it("rejects an invalid repo name before it can reach argv", async () => {
    const runGh = vi.fn<RunGh>();
    for (const xau of ["you/myapp; rm -rf /", "--repo", "../../etc", ""]) {
      expect((await fetchRepoIssues(xau, { runGh })).err).toBe("Invalid repository.");
    }
    expect(runGh).not.toHaveBeenCalled();
  });

  it("drops malformed rows instead of trusting gh's output shape", async () => {
    await registered("you/myapp");
    const runGh = vi.fn<RunGh>(async () => ({
      stdout: JSON.stringify([
        ROW,
        { number: "x", url: "https://github.com/you/myapp/issues/1" },
        { number: 2, url: "javascript:alert(1)" },
        null,
      ]),
    }));
    const { issues, err } = await fetchRepoIssues("you/myapp", { runGh });
    expect(issues.map((i) => i.number)).toEqual([41]);
    // Bỏ thì bỏ, nhưng phải NÓI đã bỏ mấy dòng: nếu gh đổi dạng JSON, một
    // bảng trống im lặng đọc y hệt "repo này chưa có issue nào".
    expect(err).toMatch(/skipped 3 of 4/);
  });

  it("gh exits 0 with something that is not a list → nói ra, không trả bảng trống", async () => {
    await registered("you/myapp");
    const runGh = vi.fn<RunGh>(async () => ({ stdout: JSON.stringify({ message: "Not Found" }) }));
    const { issues, err } = await fetchRepoIssues("you/myapp", { runGh });
    expect(issues).toEqual([]);
    expect(err).toMatch(/not an issue list/i);
  });

  it("lý do đọc thiếu nằm TRONG cache — lần sau không được im", async () => {
    await registered("you/myapp");
    const runGh = vi.fn<RunGh>(async () => ({ stdout: JSON.stringify([ROW, null]) }));
    const now = () => 1_000;
    const head = await fetchRepoIssues("you/myapp", { runGh, now });
    expect(head.err).toMatch(/skipped 1 of 2/);
    const next = await fetchRepoIssues("you/myapp", { runGh, now });
    expect(runGh).toHaveBeenCalledTimes(1);
    expect(next.err).toBe(head.err);
  });

  it("a broken gh comes back as data — one repo cannot blank the board", async () => {
    await registered("you/myapp");
    const runGh = vi.fn<RunGh>(async () => {
      throw new Error("gh: could not authenticate");
    });
    const { issues, err } = await fetchRepoIssues("you/myapp", { runGh });
    expect(issues).toEqual([]);
    expect(err).toMatch(/could not authenticate/i);
  });

  it("caches for 60s so a page refresh does not spawn gh per repo", async () => {
    await registered("you/myapp");
    const runGh = vi.fn<RunGh>(async () => ({ stdout: JSON.stringify([ROW]) }));
    let at = 1_000;
    const now = () => at;

    await fetchRepoIssues("you/myapp", { runGh, now });
    await fetchRepoIssues("you/myapp", { runGh, now });
    expect(runGh).toHaveBeenCalledTimes(1);

    at += 61_000;
    await fetchRepoIssues("you/myapp", { runGh, now });
    expect(runGh).toHaveBeenCalledTimes(2);
  });

  it("fixture mode answers without touching gh at all", async () => {
    process.env.BEE_SOURCE = "fixture";
    const runGh = vi.fn<RunGh>();
    const { issues } = await fetchRepoIssues("you/myapp", { runGh });
    expect(issues.length).toBeGreaterThan(0);
    expect(runGh).not.toHaveBeenCalled();
  });
});
