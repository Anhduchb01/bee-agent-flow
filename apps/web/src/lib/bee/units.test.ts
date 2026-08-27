import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Invariants of the systemd units themselves.
 *
 * A unit file is configuration, so nothing typechecks it and no test touches
 * it — which is how it goes silently wrong. This one pins the property that
 * cost a real failure on 27/08: `bee-services` would not start, and systemd
 * only said "the control process exited with error code".
 *
 * What it does NOT pin: DOCKER_HOST. That was my first theory for the 27/08
 * failure and it was wrong — the journal showed the unit reaching docker
 * perfectly well, pulling both images and starting postgres. The real cause
 * was a published port already in use. A unit inherits enough to find rootless
 * docker on its own here, so pinning a socket path would only add a way to be
 * wrong on a machine whose runtime dir differs.
 */

const UNITS = path.join(process.cwd(), "..", "runner", "units");

async function unit(name: string): Promise<string> {
  return fs.readFile(path.join(UNITS, name), "utf8");
}

describe("systemd units — invariants nothing else checks", () => {
  it("every unit that runs a binary carries an explicit PATH", async () => {
    for (const name of await fs.readdir(UNITS)) {
      if (!name.endsWith(".service")) continue;
      const text = await unit(name);
      if (!/^ExecStart=/m.test(text)) continue;
      expect(text, `${name} has no Environment=PATH`).toMatch(/^Environment=PATH=/m);
    }
  });
});
