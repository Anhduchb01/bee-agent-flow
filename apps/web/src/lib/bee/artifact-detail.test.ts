import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchArtifactDetail } from "./artifact-detail";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-artifact-"));
  process.env.BEE_SRV = dir;
  process.env.BEE_SOURCE = "disk";
  await fs.mkdir(path.join(dir, "repos.d"), { recursive: true });
  await fs.writeFile(path.join(dir, "repos.d", "myapp.env"), "REPO=you/myapp\n");
});
afterEach(async () => {
  delete process.env.BEE_SRV;
  delete process.env.BEE_SOURCE;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("fetchArtifactDetail — allowlist before exec", () => {
  it("rejects a dirty repo/kind/number without ever running gh", async () => {
    const runGh = vi.fn();
    for (const [repo, kind, num] of [
      ["you/myapp; rm -rf /", "issue", 1],
      ["you/myapp", "gist", 1],
      ["you/myapp", "issue", 0],
      ["you/myapp", "issue", 1.5],
    ] as const) {
      const ket = await fetchArtifactDetail(repo, kind as "issue", num, { runGh });
      expect(ket.ok, `${repo} ${kind} ${num}`).toBe(false);
    }
    expect(runGh).not.toHaveBeenCalled();
  });

  it("refuses a repo that is not registered in repos.d", async () => {
    const runGh = vi.fn();
    const ket = await fetchArtifactDetail("someone/else", "issue", 3, { runGh });
    expect(ket.ok).toBe(false);
    if (!ket.ok) expect(ket.message).toContain("not a registered repo");
    expect(runGh).not.toHaveBeenCalled();
  });
});

describe("fetchArtifactDetail — parsing", () => {
  it("issue: normalizes author/labels/comments, pr stays null", async () => {
    const runGh = vi.fn(async () => ({
      stdout: JSON.stringify({
        number: 7,
        title: "Login breaks on Safari",
        state: "OPEN",
        body: "Steps to reproduce…",
        author: { login: "pm-linh" },
        createdAt: "2026-08-19T00:00:00Z",
        url: "https://github.com/you/myapp/issues/7",
        labels: [{ name: "bug" }, { name: "p1" }],
        comments: [{ author: { login: "bee-agent" }, createdAt: "t", body: "On it." }],
      }),
    }));
    const ket = await fetchArtifactDetail("you/myapp", "issue", 7, { runGh });
    expect(ket.ok).toBe(true);
    if (!ket.ok) return;
    expect(ket.detail.title).toBe("Login breaks on Safari");
    expect(ket.detail.author).toBe("pm-linh");
    expect(ket.detail.labels).toEqual(["bug", "p1"]);
    expect(ket.detail.comments).toEqual([
      { author: "bee-agent", createdAt: "t", body: "On it." },
    ]);
    expect(ket.detail.pr).toBeNull();
    expect(runGh).toHaveBeenCalledWith(expect.arrayContaining(["issue", "7"]));
  });

  it("pr: folds statusCheckRollup — one failure wins over everything", async () => {
    const runGh = vi.fn(async () => ({
      stdout: JSON.stringify({
        number: 12,
        title: "Add export",
        state: "OPEN",
        body: "",
        author: { login: "bee-agent" },
        createdAt: "t",
        url: "https://github.com/you/myapp/pull/12",
        isDraft: true,
        baseRefName: "main",
        headRefName: "bee/myapp-41",
        additions: 10,
        deletions: 2,
        changedFiles: 3,
        statusCheckRollup: [
          { state: "SUCCESS" },
          { conclusion: "FAILURE" },
          { state: "IN_PROGRESS" },
        ],
      }),
    }));
    const ket = await fetchArtifactDetail("you/myapp", "pr", 12, { runGh });
    expect(ket.ok).toBe(true);
    if (!ket.ok) return;
    expect(ket.detail.pr).toEqual({
      draft: true,
      base: "main",
      head: "bee/myapp-41",
      additions: 10,
      deletions: 2,
      changedFiles: 3,
      checks: "fail",
    });
  });

  it("PAT without Checks:read → retries the PR WITHOUT statusCheckRollup, checks=null", async () => {
    const runGh = vi
      .fn<(args: string[]) => Promise<{ stdout: string }>>()
      .mockRejectedValueOnce(
        new Error(
          "GraphQL: Resource not accessible by personal access token (repository.pullRequest.statusCheckRollup…)",
        ),
      )
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 10,
          title: "Terms pages",
          state: "OPEN",
          body: "",
          author: { login: "bee-agent" },
          createdAt: "t",
          url: "https://github.com/you/myapp/pull/10",
          isDraft: true,
          baseRefName: "main",
          headRefName: "bee/myapp-3",
          additions: 5,
          deletions: 1,
          changedFiles: 2,
        }),
      });
    const ket = await fetchArtifactDetail("you/myapp", "pr", 10, { runGh });
    expect(ket.ok).toBe(true);
    if (!ket.ok) return;
    expect(ket.detail.title).toBe("Terms pages");
    expect(ket.detail.pr?.checks).toBeNull();
    // Lượt 2 không được mang statusCheckRollup nữa.
    expect(runGh.mock.calls[1]![0].join(",")).not.toContain("statusCheckRollup");
  });

  it("gh failing or spewing non-JSON comes back as data, not a throw", async () => {
    const chet = vi.fn(async () => {
      throw new Error("gh: Not Found (HTTP 404)");
    });
    const ket1 = await fetchArtifactDetail("you/myapp", "issue", 999, { runGh: chet });
    expect(ket1.ok).toBe(false);
    if (!ket1.ok) expect(ket1.message).toContain("404");

    const rac = vi.fn(async () => ({ stdout: "not json" }));
    const ket2 = await fetchArtifactDetail("you/myapp", "issue", 1, { runGh: rac });
    expect(ket2.ok).toBe(false);
  });
});

describe("fetchArtifactDetail — fixture mode", () => {
  it("returns staged detail without touching gh or repos.d", async () => {
    process.env.BEE_SOURCE = "fixture";
    const runGh = vi.fn();
    const ket = await fetchArtifactDetail("you/myapp", "issue", 5, { runGh });
    expect(ket.ok).toBe(true);
    if (ket.ok) {
      expect(ket.detail.kind).toBe("issue");
      expect(ket.detail.number).toBe(5);
    }
    expect(runGh).not.toHaveBeenCalled();
  });
});
