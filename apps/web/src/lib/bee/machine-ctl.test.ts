import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerRepo, setPaused, unregisterRepo, validatePat } from "./machine-ctl";

let dir = "";

describe("machine-ctl file operations (disk mode)", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-machine-"));
    process.env.BEE_SRV = dir;
    process.env.BEE_SOURCE = "disk";
    await fs.mkdir(path.join(dir, "repos.d"), { recursive: true });
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    delete process.env.BEE_SOURCE;
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe("registerRepo", () => {
    it("writes repos.d/<slug>.env with the slug derived from the repo name", async () => {
      const outcome = await registerRepo("You/My-App");
      expect(outcome).toEqual({ ok: true, slug: "my-app" });
      const content = await fs.readFile(path.join(dir, "repos.d", "my-app.env"), "utf8");
      expect(content).toBe("REPO=You/My-App\n");
    });

    it("rejects anything that is not owner/name — the allowlist regex is the door", async () => {
      for (const bad of ["", "no-slash", "a/b/c", "owner/", "/name", "own er/name", "owner/na me"]) {
        const outcome = await registerRepo(bad);
        expect(outcome.ok, bad).toBe(false);
      }
    });

    it("same repo again is idempotent; a DIFFERENT repo with a colliding slug is refused", async () => {
      await registerRepo("you/myapp");
      expect((await registerRepo("you/myapp")).ok).toBe(true);
      const outcome = await registerRepo("someone-else/myapp");
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.message).toContain("myapp");
    });
  });

  describe("unregisterRepo", () => {
    it("removes the env file; a dirty slug never reaches the filesystem", async () => {
      await registerRepo("you/myapp");
      expect((await unregisterRepo("myapp")).ok).toBe(true);
      await expect(fs.access(path.join(dir, "repos.d", "myapp.env"))).rejects.toThrow();

      expect((await unregisterRepo("../../etc")).ok).toBe(false);
    });
  });

  describe("setPaused", () => {
    it("true creates PAUSE, false removes it, both idempotent", async () => {
      expect((await setPaused(true)).ok).toBe(true);
      await expect(fs.access(path.join(dir, "PAUSE"))).resolves.toBeUndefined();
      expect((await setPaused(true)).ok).toBe(true);

      expect((await setPaused(false)).ok).toBe(true);
      await expect(fs.access(path.join(dir, "PAUSE"))).rejects.toThrow();
      expect((await setPaused(false)).ok).toBe(true);
    });
  });
});

describe("validatePat", () => {
  it("accepts only fine-grained tokens — the same rule doctor enforces", () => {
    expect(validatePat("github_pat_ABC123_def")).toBe(true);
    expect(validatePat("  github_pat_ABC123  ")).toBe(true); // trimmed
    expect(validatePat("ghp_classictoken")).toBe(false);
    expect(validatePat("gho_oauthtoken")).toBe(false);
    expect(validatePat("")).toBe(false);
    expect(validatePat("github_pat_")).toBe(false);
    expect(validatePat("github_pat_has spaces")).toBe(false);
  });
});
