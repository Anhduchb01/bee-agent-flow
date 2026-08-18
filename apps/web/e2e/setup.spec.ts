import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

/**
 * Onboarding screen: install steps + the machine's own doctor.json as live
 * proof. The fixture doctor mixes green and red on purpose — both shapes
 * must render, and the red one must carry its fix hint.
 */
test("setup page walks the install and shows live doctor checks", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await page.goto("/setup");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Setup");

  // The five steps, in order.
  for (const step of [
    "Install the runner",
    "Sign in on the machine",
    "Register each repo",
    "Verify",
    "Un-pause and test",
  ]) {
    await expect(page.getByRole("heading", { name: new RegExp(step) })).toBeVisible();
  }

  // Live doctor checks from the fixture: a pass, a fail WITH its fix hint,
  // and the PAUSE banner.
  const checks = page.getByRole("list", { name: "Doctor checks" });
  await expect(checks).toContainText("fine-grained PAT");
  await expect(checks).toContainText("CHƯA có branch protection");
  await expect(page.getByText(/PAUSED — the machine takes no new sessions/)).toBeVisible();

  // Registered repos come from the same source the session form uses.
  await expect(page.getByRole("list", { name: "Registered repos" })).toContainText("you/myapp");

  // Re-run from the web must not blow up (fixture no-op).
  await page.getByRole("button", { name: "Run doctor again" }).click();
  await expect(checks).toBeVisible();

  // The final step embeds the real session form — test ends where usage begins.
  await expect(page.getByRole("combobox", { name: "Repository" })).toBeVisible();
});
