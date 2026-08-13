import "server-only";

import { createFixtureGithubSource } from "./fixture";
import { createLiveGithubSource } from "./live";
import type { GithubSource } from "./types";

export * from "./types";
export { resetGithubFixture } from "./fixture";

/**
 * Cửa duy nhất ra GitHub. Cùng lý do như `lib/bee/`: `GITHUB_SOURCE` là chỗ duy
 * nhất biết mình đang chạy trên fixture hay dữ liệu thật.
 */
let cached: GithubSource | null = null;

export function getGithub(): GithubSource {
  if (cached) return cached;
  cached =
    process.env.GITHUB_SOURCE === "live"
      ? createLiveGithubSource()
      : createFixtureGithubSource();
  return cached;
}

/** Chỉ dành cho test. */
export function resetGithubSource(): void {
  cached = null;
}
