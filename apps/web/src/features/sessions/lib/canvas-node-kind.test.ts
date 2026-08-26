import { describe, expect, it } from "vitest";

import type { BeeSession, Queue } from "@/lib/bee/types";

import { NODE_KIND, buildGraph } from "./build-graph";

/**
 * Every kind buildGraph emits must be declared in NODE_KIND, because the React
 * Flow registry in canvas-view is typed `Record<NodeKind, …>` — that is what
 * makes a missing renderer a typecheck error instead of a blank node.
 *
 * React Flow does not warn on an unknown type: it silently falls back to its
 * default node, an empty box with two handles. That is how the canvas went
 * blank on 26/08 — an identifier rename moved the registry key `phien` to
 * `session` while `type: "phien"` stayed a string literal the rename skipped.
 */

const SESSION: BeeSession = {
  id: "aaaaaaaa-1111-4222-8333-444444444444",
  slug: "myapp",
  num: 41,
  repo: "you/myapp",
  title: null,
  phase: "work",
  worktree: true,
  status: "running",
  created_at: null,
  started_at: null,
  ended_at: null,
  attempt: 0,
  needs_human: false,
};

const QUEUE: Queue = {
  paused: false,
  items: [
    {
      slug: "myapp",
      repo: "you/myapp",
      issue: 7,
      mode: "auto",
      model: "default",
      status: "waiting",
      sessionId: null,
      reason: null,
      added_at: "2026-08-24T15:00:00Z",
    },
  ],
};

describe("canvas node kinds", () => {
  it("emits nothing NODE_KIND does not declare", () => {
    const { nodes } = buildGraph(
      [{ repo: "you/myapp", session: [SESSION] }],
      {
        [SESSION.id]: [
          {
            kind: "pr",
            url: "https://github.com/you/myapp/pull/123",
            number: 123,
            ts: null,
            title: null,
          },
        ],
      },
      {},
      { [SESSION.id]: [{ name: "demo.mp4", url: "/api/evidence/x" }] },
      QUEUE,
    );

    const emitted = [...new Set(nodes.map((n) => n.type))];
    expect(emitted.length).toBeGreaterThan(1);
    expect(emitted.filter((k) => !NODE_KIND.includes(k))).toEqual([]);
  });

  it("names every kind in English — the registry key is a value, not an identifier", () => {
    expect([...NODE_KIND].sort()).toEqual(["artifact", "demo", "queued", "repo-group", "session"]);
  });
});
