import { expect, test } from "@playwright/test";

import { dangNhap, datCanh } from "./helpers";

/**
 * Onboarding screen: everything but install.sh and the interactive claude
 * login is done HERE — buttons and forms, verified by the machine's own
 * doctor.json. The co-su-co scene mixes green and red on purpose.
 */
test("setup page: interactive steps + live doctor checks", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  await datCanh(page, "co-su-co");
  await page.goto("/setup");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Setup");

  // The five steps, in order.
  for (const step of [
    "Install the runner",
    "Sign in",
    "Register repos",
    "Verify",
    "Go live",
  ]) {
    await expect(page.getByRole("heading", { name: new RegExp(step) })).toBeVisible();
  }

  // Sign-in step is interactive: PAT form refuses a classic token client-side.
  const pat = page.getByLabel("Fine-grained PAT");
  await pat.fill("ghp_classictoken");
  await page.getByRole("button", { name: "Save PAT" }).click();
  await expect(page.getByText(/not a fine-grained pat/i)).toBeVisible();

  // Repo registry: a malformed repo is rejected with the server's reason
  // (validation runs before the fixture no-op).
  await page.getByLabel("Repository to register").fill("not-a-repo");
  await page.getByRole("button", { name: "Add repo" }).click();
  await expect(page.getByText(/must be owner\/name/i)).toBeVisible();

  // Registered repos show doctor's protection verdict + a settings deep-link.
  const dsRepo = page.getByRole("list", { name: "Registered repos" });
  await expect(dsRepo).toContainText("you/myapp");
  await expect(page.getByRole("link", { name: /protect main/i }).first()).toHaveAttribute(
    "href",
    /github\.com\/you\/.*\/settings\/branches/,
  );

  // Live doctor checks: a pass, a fail WITH its fix hint.
  const checks = page.getByRole("list", { name: "Doctor checks" });
  await expect(checks).toContainText("fine-grained PAT");
  await expect(checks).toContainText("CHƯA có branch protection");

  // Doctor red → going live is locked, and it says why.
  await expect(page.getByRole("button", { name: /remove pause/i })).toBeDisabled();
  await expect(page.getByText(/until every doctor check is green/i)).toBeVisible();

  // The final step embeds the real session form — test ends where usage begins.
  await expect(page.getByRole("combobox", { name: "Repository" })).toBeVisible();
});

test("machine ready: go-live button is armed", async ({ page }) => {
  await dangNhap(page, "pm-linh");
  // binh-thuong scene: doctor all green but... paused=false → shows live state.
  await page.goto("/setup");
  await expect(page.getByText(/machine is live/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /pause machine/i })).toBeEnabled();
});

/**
 * Post-login routing: a machine that never ran doctor (fresh install) or
 * has failing checks drops you on /setup, not an empty Overview. A ready
 * machine lands on Overview — that path is covered by smoke.spec.
 */
test("fresh machine: login lands on /setup", async ({ page }) => {
  await datCanh(page, "vua-cai");
  await dangNhap(page, "pm-linh");

  await expect(page).toHaveURL(/\/setup/);
  await expect(page.getByText(/doctor has never run/i)).toBeVisible();
});

test("failing checks: login lands on /setup too", async ({ page }) => {
  await datCanh(page, "co-su-co");
  await dangNhap(page, "pm-linh");

  await expect(page).toHaveURL(/\/setup/);
  await expect(page.getByRole("list", { name: "Doctor checks" })).toContainText(
    "CHƯA có branch protection",
  );
});
