/** Live artifact-node state (V2.2) — pure helpers, no server imports. */

/** github.com URL → what the detail action needs. Anything else: no panel. */
export function unwrapArtifactUrl(
  url: string,
): { repo: string; kind: "issue" | "pr"; number: number } | null {
  const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(issues|pull)\/(\d+)/.exec(url);
  if (m === null) return null;
  return { repo: m[1]!, kind: m[2] === "pull" ? "pr" : "issue", number: Number(m[3]) };
}

/** Live state fetched for a node — cached 60s server-side. */
export interface ArtifactSong {
  state: string;
  draft: boolean;
  checks: "pass" | "fail" | "pending" | null;
}

/**
 * GitHub's color language, applied live: open green · draft gray ·
 * merged purple · closed red (PR) / gray (issue). No data yet → the old
 * static colors, so the canvas never flashes.
 */
export function artifactColour(kind: "issue" | "pr", live: ArtifactSong | null | undefined): string {
  if (!live) return kind === "pr" ? "text-purple-400" : "text-green-500";
  if (live.state === "MERGED") return "text-purple-400";
  if (live.state === "CLOSED") return kind === "pr" ? "text-red-400" : "text-muted-foreground";
  return live.draft ? "text-muted-foreground" : "text-green-500";
}
