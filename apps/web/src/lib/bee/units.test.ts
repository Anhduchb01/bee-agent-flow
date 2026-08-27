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
 * The reason: systemd user units inherit XDG_RUNTIME_DIR but NOT DOCKER_HOST.
 * bootstrap.sh exports it for the interactive shell, so `docker compose` works
 * the moment a person types it and fails inside a unit, where the CLI falls
 * back to root's /var/run/docker.sock and is denied. Under model A+ the docker
 * that exists is rootless, at %t/docker.sock.
 */

const UNITS = path.join(process.cwd(), "..", "runner", "units");

async function unit(name: string): Promise<string> {
  return fs.readFile(path.join(UNITS, name), "utf8");
}

describe("systemd units — the environment a unit cannot inherit", () => {
  for (const name of ["bee-services.service", "bee-session@.service"]) {
    it(`${name} points docker at the rootless socket`, async () => {
      const text = await unit(name);
      expect(text).toMatch(/^Environment=DOCKER_HOST=unix:\/\/%t\/docker\.sock$/m);
    });
  }

  it("the pool unit lets admin.env override it — an escape hatch must win", async () => {
    const text = await unit("bee-services.service");
    const docker = text.indexOf("Environment=DOCKER_HOST=");
    const envFile = text.indexOf("EnvironmentFile=");
    expect(docker).toBeGreaterThan(-1);
    // systemd applies these in order, so the file has to come second.
    expect(envFile).toBeGreaterThan(docker);
  });

  it("every unit that runs a binary carries an explicit PATH", async () => {
    for (const name of await fs.readdir(UNITS)) {
      if (!name.endsWith(".service")) continue;
      const text = await unit(name);
      if (!/^ExecStart=/m.test(text)) continue;
      expect(text, `${name} has no Environment=PATH`).toMatch(/^Environment=PATH=/m);
    }
  });
});
