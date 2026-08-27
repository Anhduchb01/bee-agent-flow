import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CHIP_FLOW } from "../components/chip-flow";

/**
 * Every chip must name a command the runner actually installs.
 *
 * A chip only renders when its command exists in `~/.claude/commands`, which
 * install.sh fills from `apps/runner/commands/*.md`. So a chip for a command
 * with no file does not break — it silently never appears, and the owner is
 * left wondering where their button went. That is exactly what happened to
 * /build and /review: listed here since the chips were built, never shipped.
 *
 * Nothing else spans that boundary: the list is TypeScript, the commands are
 * markdown copied by a bash script.
 */

const COMMANDS = path.join(process.cwd(), "..", "runner", "commands");

describe("session chips ↔ installed commands", () => {
  it("every chip has a command file the runner installs", async () => {
    const shipped = (await fs.readdir(COMMANDS))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3));

    expect(shipped.length).toBeGreaterThan(0);
    for (const chip of CHIP_FLOW) {
      expect(shipped, `/${chip.command} has no apps/runner/commands/${chip.command}.md`).toContain(
        chip.command,
      );
    }
  });

  it("every installed command has a description — /setup lists them by it", async () => {
    for (const f of await fs.readdir(COMMANDS)) {
      if (!f.endsWith(".md")) continue;
      const text = await fs.readFile(path.join(COMMANDS, f), "utf8");
      expect(text, `${f} has no frontmatter description`).toMatch(/^---\ndescription: \S/);
    }
  });
});
