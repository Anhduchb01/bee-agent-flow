import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readSkillsFrom } from "./doctor-fs";

let dir = "";

describe("readSkillsFrom — global skills feed the / palette", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-skills-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("parses name + description from SKILL.md frontmatter, sorted by name", async () => {
    await fs.mkdir(path.join(dir, "bee-push-pr"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "bee-push-pr", "SKILL.md"),
      '---\nname: bee-push-pr\ndescription: "Push branch của phiên bee và mở draft pull request."\n---\nbody',
    );
    await fs.mkdir(path.join(dir, "tdd"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "tdd", "SKILL.md"),
      "---\nname: test-driven-development\ndescription: Drives development with tests. Use when implementing any logic or fixing bugs, and also this tail should be cut because palettes need one line not an essay about everything the skill has ever done for anyone anywhere.\n---\n",
    );

    const ds = await readSkillsFrom(dir);
    expect(ds.map((s) => s.name)).toEqual(["bee-push-pr", "test-driven-development"]);
    expect(ds[0]!.moTa).toBe("Push branch của phiên bee và mở draft pull request.");
    expect(ds[1]!.moTa.length).toBeLessThanOrEqual(121);
  });

  it("folders without SKILL.md are skipped; missing dir → empty", async () => {
    await fs.mkdir(path.join(dir, "rong"), { recursive: true });
    expect(await readSkillsFrom(dir)).toEqual([]);
    expect(await readSkillsFrom(path.join(dir, "khong-co"))).toEqual([]);
  });
});
