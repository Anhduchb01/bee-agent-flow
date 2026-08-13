import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import type { TrangThaiBao } from "../lib/plan";

/**
 * Trạng thái "đã báo", theo từng người.
 *
 * **Không** nằm dưới `/srv/bee/` — app chỉ được đọc chỗ đó. Đây là dữ liệu của
 * riêng app, nên nó có thư mục riêng do `bee-web` sở hữu. Không đặt
 * `NOTIFY_STATE_DIR` thì state sống trong bộ nhớ, và hệ quả là khởi động lại
 * app sẽ báo lại một lượt — chấp nhận được khi chạy fixture, không chấp nhận
 * được khi chạy thật.
 */
const DIR = process.env.NOTIFY_STATE_DIR;
const KEY = Symbol.for("bee.notify.state");

type State = Record<string, TrangThaiBao>;

function boNho(): State {
  const g = globalThis as unknown as Record<symbol, State | undefined>;
  g[KEY] ??= {};
  return g[KEY];
}

const FILE = () => path.join(DIR!, "notify.json");

export async function docState(): Promise<State> {
  if (!DIR) return { ...boNho() };
  try {
    return JSON.parse(await fs.readFile(FILE(), "utf8")) as State;
  } catch {
    return {};
  }
}

export async function ghiState(state: State): Promise<void> {
  if (!DIR) {
    Object.assign(boNho(), state);
    return;
  }
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmp, FILE());
}

/**
 * Ghi lại lần thao tác gần nhất của một người.
 *
 * Gọi từ mọi server action: người vừa bấm gì đó trong app thì đang nhìn thẳng
 * vào nó, và một tin Slack lúc đó chỉ là tiếng ồn.
 */
export async function ghiThaoTac(login: string): Promise<void> {
  const state = await docState();
  const cu = state[login] ?? { daBao: {}, lanCuoi: null, thaoTacCuoi: null };
  await ghiState({ ...state, [login]: { ...cu, thaoTacCuoi: new Date().toISOString() } });
}

/** Chỉ dành cho test. */
export function xoaStateBoNho(): void {
  (globalThis as unknown as Record<symbol, State | undefined>)[KEY] = {};
}
