import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { composeFlowSteps, readFlow, writeFlow } from "./flow-fs";

let dir = "";
let commandsDir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-flow-"));
  commandsDir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-flow-cmds-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(commandsDir, { recursive: true, force: true });
});

describe("flow.json — thứ tự /lệnh Autopilot tự đi qua", () => {
  it("chưa có file → mặc định build/review/demo/pr", async () => {
    expect(await readFlow(dir)).toEqual({ steps: ["build", "review", "demo", "pr"] });
  });

  it("ghi rồi đọc lại y nguyên", async () => {
    await writeFlow(dir, { steps: ["issue", "build", "pr"] });
    expect(await readFlow(dir)).toEqual({ steps: ["issue", "build", "pr"] });
  });

  it("ghi nguyên tử: không để lại file tmp", async () => {
    await writeFlow(dir, { steps: ["build"] });
    expect(await fs.readdir(dir)).toEqual(["flow.json"]);
  });

  it("json hỏng → mặc định, không ném lỗi", async () => {
    await fs.writeFile(path.join(dir, "flow.json"), '{"steps":[');
    expect(await readFlow(dir)).toEqual({ steps: ["build", "review", "demo", "pr"] });
  });

  it("bước lạ bị loại; rỗng sau khi lọc → mặc định", async () => {
    await fs.writeFile(path.join(dir, "flow.json"), JSON.stringify({ steps: ["deploy", "yolo"] }));
    expect(await readFlow(dir)).toEqual({ steps: ["build", "review", "demo", "pr"] });
  });

  it("bước lạ bị loại, bước đúng giữ lại", async () => {
    await fs.writeFile(path.join(dir, "flow.json"), JSON.stringify({ steps: ["build", "deploy", "pr"] }));
    expect(await readFlow(dir)).toEqual({ steps: ["build", "pr"] });
  });

  it("writeFlow cũng lọc bước lạ trước khi ghi đĩa", async () => {
    await writeFlow(dir, { steps: ["build", "deploy" as never, "pr"] });
    expect(await readFlow(dir)).toEqual({ steps: ["build", "pr"] });
  });
});

describe("composeFlowSteps — mỗi bước = đúng thân file lệnh, không đổi gì", () => {
  it("expand từng bước theo đúng thứ tự truyền vào", async () => {
    await fs.writeFile(path.join(commandsDir, "build.md"), "---\ndescription: x\n---\n\nDo the build.\n");
    await fs.writeFile(path.join(commandsDir, "pr.md"), "---\ndescription: x\n---\n\nOpen the PR.\n");
    const steps = await composeFlowSteps(["build", "pr"], commandsDir);
    expect(steps).toEqual(["Do the build.", "Open the PR."]);
  });

  it("lệnh chưa cài (thiếu file .md) → trả về nguyên văn '/tên' thay vì ném lỗi", async () => {
    const steps = await composeFlowSteps(["demo"], commandsDir);
    expect(steps).toEqual(["/demo"]);
  });
});
