import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { expandCommandText, readCommandsFrom } from "./doctor-fs";

let dir = "";

describe("global slash commands — list for the palette, expand on send", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-cmd-"));
    await fs.writeFile(
      path.join(dir, "build.md"),
      "---\ndescription: Implement tasks incrementally\n---\n\nDo the build flow.\n\nMode: `$ARGUMENTS` selects the mode.",
    );
    await fs.writeFile(path.join(dir, "plan.md"), "---\ndescription: Break work into tasks\n---\n\nMake a plan.");
    await fs.writeFile(path.join(dir, "ghi-chu.txt"), "not a command");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("lists *.md with frontmatter descriptions, sorted; other files skipped", async () => {
    const entries = await readCommandsFrom(dir);
    expect(entries).toEqual([
      { name: "build", hint: "Implement tasks incrementally" },
      { name: "plan", hint: "Break work into tasks" },
    ]);
    expect(await readCommandsFrom(path.join(dir, "no-such"))).toEqual([]);
  });

  it("expands /name args like the REPL: frontmatter stripped, $ARGUMENTS filled", async () => {
    const ra = await expandCommandText(dir, "/build auto");
    expect(ra).toContain("Do the build flow.");
    expect(ra).toContain("Mode: `auto` selects the mode.");
    expect(ra).not.toContain("description:");
  });

  it("no $ARGUMENTS in body → args appended; no args → body alone", async () => {
    expect(await expandCommandText(dir, "/plan làm phần setup")).toBe(
      "Make a plan.\n\nARGUMENTS: làm phần setup",
    );
    expect(await expandCommandText(dir, "/plan")).toBe("Make a plan.");
  });

  it("plain text, unknown command, or a dirty name pass through untouched", async () => {
    expect(await expandCommandText(dir, "xin chào")).toBe("xin chào");
    expect(await expandCommandText(dir, "/khong-ton-tai x")).toBe("/khong-ton-tai x");
    expect(await expandCommandText(dir, "/../../etc/passwd")).toBe("/../../etc/passwd");
  });
});
