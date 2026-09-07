import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { expandCommandText } from "./doctor-fs";
import { KNOWN_FLOW_STEPS, type AutopilotFlow, type FlowStep } from "./types";

/**
 * `flow.json` — thứ tự /lệnh Autopilot tự chạy qua sau khi mở phiên. Cùng kỷ
 * luật với `queue.json`: JSON từ đĩa là `unknown`, một giá trị lạ rớt ra chứ
 * không được lái phiên đi hỏi lệnh không tồn tại.
 */

const DEFAULT_FLOW: AutopilotFlow = { steps: ["build", "review", "demo", "pr"] };

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isFlowStep(x: unknown): x is FlowStep {
  return typeof x === "string" && (KNOWN_FLOW_STEPS as readonly string[]).includes(x);
}

export async function readFlow(root: string): Promise<AutopilotFlow> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(root, "flow.json"), "utf8"));
  } catch {
    return DEFAULT_FLOW; // chưa cấu hình — mặc định là thứ tự chip vẫn gửi
  }
  const steps = isObject(raw) && Array.isArray(raw.steps) ? raw.steps.filter(isFlowStep) : [];
  return { steps: steps.length > 0 ? steps : DEFAULT_FLOW.steps };
}

/** tmp + rename: cùng đĩa với queue.json, không ai được thấy nửa file. */
export async function writeFlow(root: string, flow: AutopilotFlow): Promise<void> {
  const steps = flow.steps.filter(isFlowStep);
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, "flow.json");
  const tmp = path.join(root, ".flow.json.tmp");
  await fs.writeFile(tmp, JSON.stringify({ steps }, null, 2));
  await fs.rename(tmp, file);
}

/**
 * Expand mỗi bước thành đúng nội dung một chip sẽ gửi (thân file lệnh, không
 * đổi gì) — runner chỉ lo THỜI ĐIỂM gửi từng cái, không đụng vào markdown.
 *
 * `commandsDir` mặc định `~/.claude/commands` (nơi install.sh chép lệnh vào);
 * tham số này chỉ để test tự trỏ vào một thư mục lệnh giả.
 */
export async function composeFlowSteps(
  steps: FlowStep[],
  commandsDir: string = path.join(process.env.HOME ?? "", ".claude", "commands"),
): Promise<string[]> {
  const out: string[] = [];
  for (const step of steps) {
    out.push(await expandCommandText(commandsDir, `/${step}`));
  }
  return out;
}
