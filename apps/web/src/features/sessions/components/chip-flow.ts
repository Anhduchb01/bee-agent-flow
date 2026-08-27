/**
 * The flow chips above the chat box.
 *
 * Its own module so a test can check it against `apps/runner/commands/` —
 * a chip whose command the runner does not install never renders, and says
 * nothing about why (that is how /build and /review went missing).
 *
 * Order is the flow itself: file the issue, build it, review it, open the PR,
 * then show it working.
 */
export const CHIP_FLOW = [
  { command: "issue", label: "Issue" },
  { command: "build", label: "Build" },
  { command: "review", label: "Review" },
  { command: "pr", label: "PR" },
  { command: "demo", label: "Demo" },
  { command: "preview", label: "Preview" },
] as const;
