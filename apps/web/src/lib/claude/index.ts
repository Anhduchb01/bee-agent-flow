import "server-only";

import { createFixtureClaudeSource } from "./fixture";
import { createLiveClaudeSource } from "./live";
import type { ClaudeSource } from "./types";

export * from "./types";

/** Cùng luật với `lib/bee` và `lib/github`: một biến môi trường, một chỗ biết. */
let cached: ClaudeSource | null = null;

export function getClaude(): ClaudeSource {
  if (cached) return cached;
  cached =
    process.env.CLAUDE_SOURCE === "live"
      ? createLiveClaudeSource()
      : createFixtureClaudeSource();
  return cached;
}

/** Chỉ dành cho test. */
export function resetClaudeSource(): void {
  cached = null;
}
