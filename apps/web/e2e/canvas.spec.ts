import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

/**
 * React Flow renders an unknown node type as its DEFAULT node — an empty box
 * with two handles — and logs nothing. So a canvas whose registry key drifted
 * from the kind build-graph emits still "works": right node count, right
 * layout, no error, no content. That shipped on 26/08.
 *
 * These assertions are about what a node CONTAINS, not that one exists.
 */

test("every canvas node draws its own shape, never React Flow's blank fallback", async ({
  page,
}) => {
  await signIn(page, "pm-linh");
  await page.goto("/canvas");

  const nodes = page.locator(".react-flow__node");
  await expect(nodes.first()).toBeVisible();

  // The tell: React Flow's fallback carries the `-default` class.
  await expect(page.locator(".react-flow__node-default")).toHaveCount(0);
  await expect(page.locator(".react-flow__node-session").first()).toBeVisible();
});

test("a session node says which session it is", async ({ page }) => {
  await signIn(page, "pm-linh");
  await page.goto("/canvas");

  const session = page.locator(".react-flow__node-session").first();
  await expect(session).toBeVisible();

  // Title, branch and status all live in the node — an empty box has none.
  await expect(session.getByRole("link", { name: "Open full page" })).toBeVisible();
  await expect(session).not.toBeEmpty();
});
