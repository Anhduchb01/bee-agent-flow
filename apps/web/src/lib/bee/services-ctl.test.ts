import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  composePorts,
  explainUnitFailure,
  readPoolCompose,
  savePoolCompose,
  setPoolRunning,
} from "./services-ctl";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-svc-"));
  process.env.BEE_SRV = dir;
  process.env.BEE_SOURCE = "disk";
  await fs.mkdir(path.join(dir, "services"), { recursive: true });
});
afterEach(async () => {
  delete process.env.BEE_SRV;
  delete process.env.BEE_SOURCE;
  await fs.rm(dir, { recursive: true, force: true });
});

const compose = (body: string) => fs.writeFile(path.join(dir, "services", "compose.yml"), body);

async function slice(sessionId: string) {
  const sdir = path.join(dir, "sessions", sessionId);
  await fs.mkdir(sdir, { recursive: true });
  await fs.writeFile(
    path.join(sdir, "services.json"),
    JSON.stringify({
      slice: "bee_11111111",
      at: "2026-08-27T10:00:00Z",
      items: [{ service: "postgres", image: "postgres:16", kind: "postgres", in_pool: true }],
    }),
  );
}

describe("readPoolCompose", () => {
  it("hands back the file the machine actually runs", async () => {
    await compose("services:\n  postgres:\n    image: postgres:16\n");
    expect((await readPoolCompose()).text).toContain("postgres:16");
  });

  it("a machine with no pool yet gets a starting point, not an error", async () => {
    const read = await readPoolCompose();
    expect(read.text).toContain("services:");
    expect(read.exists).toBe(false);
  });
});

describe("savePoolCompose", () => {
  it("refuses text that is not a compose file — an unparseable pool refuses every session", async () => {
    const outcome = await savePoolCompose("this is not: [yaml");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/compose|yaml|parse/i);
  });

  it("refuses a file with no services key — nothing to share", async () => {
    const outcome = await savePoolCompose("volumes:\n  data: {}\n");
    expect(outcome.ok).toBe(false);
  });

  it("refuses something enormous — this file names services, it does not carry data", async () => {
    const outcome = await savePoolCompose(`services:\n  a:\n    image: x\n# ${"y".repeat(70_000)}`);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/large/i);
  });

  it("writes a good file, and does not leave the old one half-replaced", async () => {
    await compose("services:\n  old:\n    image: old:1\n");
    const outcome = await savePoolCompose("services:\n  postgres:\n    image: postgres:16\n");
    expect(outcome.ok).toBe(true);
    expect((await readPoolCompose()).text).toContain("postgres:16");
    const left = await fs.readdir(path.join(dir, "services"));
    expect(left.filter((f) => f.includes("tmp"))).toEqual([]);
  });

  it("a rejected save leaves the previous file untouched", async () => {
    await compose("services:\n  good:\n    image: good:1\n");
    await savePoolCompose("nonsense: [");
    expect((await readPoolCompose()).text).toContain("good:1");
  });
});

describe("setPoolRunning — off is the dangerous direction", () => {
  it("refuses to stop the pool while a session holds a slice of it", async () => {
    await compose("services:\n  postgres:\n    image: postgres:16\n");
    await slice("aaaaaaaa-1111-4222-8333-444444444444");

    const outcome = await setPoolRunning(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/1 session/i);
  });

  it("names the sessions, so the owner knows what they are about to break", async () => {
    await compose("services:\n  postgres:\n    image: postgres:16\n");
    await slice("aaaaaaaa-1111-4222-8333-444444444444");
    await slice("bbbbbbbb-1111-4222-8333-444444444444");

    const outcome = await setPoolRunning(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/2 sessions/i);
  });

  it("force stops anyway — the owner may know something we do not", async () => {
    await compose("services:\n  postgres:\n    image: postgres:16\n");
    await slice("aaaaaaaa-1111-4222-8333-444444444444");

    // BEE_CTL=none in the suite: systemctl refuses, so this proves the GATE
    // opened, not that the unit stopped.
    const outcome = await setPoolRunning(false, { force: true });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).not.toMatch(/holds a slice/i);
  });

  it("starting needs no permission — nothing is destroyed by turning it on", async () => {
    await compose("services:\n  postgres:\n    image: postgres:16\n");
    await slice("aaaaaaaa-1111-4222-8333-444444444444");

    const outcome = await setPoolRunning(true);
    if (!outcome.ok) expect(outcome.message).not.toMatch(/holds a slice/i);
  });

  it("refuses to start an empty pool — a unit that comes up with nothing is a lie", async () => {
    await compose("services: {}\n");
    const outcome = await setPoolRunning(true);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/no service/i);
  });
});

describe("explainUnitFailure — a failure that names itself", () => {
  it("docker unreachable is the answer, not 'see journalctl'", () => {
    const said = explainUnitFailure(
      "docker: Cannot connect to the Docker daemon at unix:///var/run/docker.sock.",
    );
    expect(said).toMatch(/docker/i);
    expect(said).toMatch(/rootless|daemon/i);
  });

  it("a pulled-image failure says which image", () => {
    const said = explainUnitFailure(
      "postgres Pulling\nErr: pull access denied for postgrs, repository does not exist",
    );
    expect(said).toMatch(/pull access denied/);
  });

  it("a port clash is quoted as docker said it", () => {
    const said = explainUnitFailure(
      'Error response from daemon: driver failed programming external connectivity: ' +
        "bind for 127.0.0.1:55432 failed: port is already allocated",
    );
    expect(said).toMatch(/55432/);
    expect(said).toMatch(/already allocated/);
  });

  it("drops systemd's own noise — it is what the owner already saw", () => {
    const said = explainUnitFailure(
      [
        "Starting bee services...",
        "bee-services.service: Main process exited, code=exited, status=1/FAILURE",
        "yaml: line 4: did not find expected key",
        "bee-services.service: Failed with result 'exit-code'.",
      ].join("\n"),
    );
    expect(said).toContain("did not find expected key");
    expect(said).not.toMatch(/Failed with result/);
  });

  /**
   * The real journal from 27/08, trimmed. The pool pulled both images, made
   * the network and volumes, started postgres — and died on rabbitmq's
   * MANAGEMENT port, which was already taken on that machine. Everything
   * before the last line is progress, and progress is what buries a reason.
   */
  it("finds the reason under thirty lines of pull progress", () => {
    const said = explainUnitFailure(
      [
        " 5322d81b9b21 Pull complete 0B",
        " Image rabbitmq:3-management Pulled",
        " Image postgres:16 Pulled",
        " Network bee-services_default Created",
        " Volume bee-services_pgdata Created",
        " Container bee-services-postgres-1 Started",
        " Container bee-services-rabbitmq-1 Starting",
        "Error response from daemon: failed to set up container networking: driver failed" +
          " programming external connectivity on endpoint bee-services-rabbitmq-1" +
          " (b93d84b3fb67): error while calling RootlessKit PortManager.AddPort():" +
          " listen tcp4 127.0.0.1:15672: bind: address already in use",
        "bee-services.service: Main process exited, code=exited, status=1/FAILURE",
        "bee-services.service: Failed with result 'exit-code'.",
      ].join("\n"),
    );

    expect(said).toContain("15672");
    expect(said).toContain("address already in use");
    // Not a word of systemd's bookkeeping, and not one of the 30 Pull lines.
    expect(said).not.toMatch(/Pull complete|Failed with result|status=1/);
  });

  it("nothing usable in the journal is said plainly, not invented", () => {
    expect(explainUnitFailure("")).toMatch(/journalctl/);
  });
});

describe("composePorts — refuse before the half-started mess", () => {
  it("finds every published host port, whatever the syntax", () => {
    expect(
      composePorts(
        [
          "services:",
          "  postgres:",
          "    ports: [\"127.0.0.1:55432:5432\"]",
          "  rabbitmq:",
          "    ports:",
          "      - \"127.0.0.1:55672:5672\"",
          "      - 15672:15672",
          "  quiet:",
          "    image: redis:7",
        ].join("\n"),
      ).sort((a, b) => a - b),
    ).toEqual([15672, 55432, 55672]);
  });

  it("a container-only port publishes nothing, so it is not a claim", () => {
    expect(composePorts('services:\n  a:\n    ports: ["5432"]\n')).toEqual([]);
  });

  it("the IP is not mistaken for a port — 127.0.0.1 is full of digits", () => {
    expect(composePorts('services:\n  a:\n    ports: ["127.0.0.1:55432:5432"]\n')).toEqual([55432]);
  });
});
