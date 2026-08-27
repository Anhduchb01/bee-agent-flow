import { expect, test } from "@playwright/test";

import { signIn, setScene } from "./helpers";

/**
 * Onboarding screen: everything but install.sh and the interactive claude
 * login is done HERE — buttons and forms, verified by the machine's own
 * doctor.json. The something-wrong scene mixes green and red on purpose.
 */
test("setup page: interactive steps + live doctor checks", async ({ page }) => {
  await signIn(page, "pm-linh");
  await setScene(page, "something-wrong");
  await page.goto("/setup");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Setup");

  // Fixture mode must OUT ITSELF — a demo that looks real teaches the user
  // their machine is configured when it is not.
  await expect(page.getByText(/DEMO DATA/)).toBeVisible();

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

  // Claude: live status + the whole login flow from the web — get the
  // link, then a code box appears (fixture hands back a demo URL).
  await expect(page.getByText(/claude not signed in yet/i)).toBeVisible();
  await page.getByRole("button", { name: "Get login link" }).click();
  await expect(page.getByRole("link", { name: /open claude\.ai and approve/i })).toHaveAttribute(
    "href",
    /claude\.ai\/oauth/,
  );
  await expect(page.getByLabel("Confirmation code")).toBeVisible();

  // Fallback stays: pasting an API key instead of a setup-token is refused.
  await page.getByText(/or paste a token/i).click();
  await page.getByLabel("Claude setup-token").fill("sk-ant-api03-key");
  await page.getByRole("button", { name: "Save token" }).click();
  await expect(page.getByText(/not a setup-token token/i)).toBeVisible();

  // Repo registry: a malformed repo is rejected with the server's reason
  // (validation runs before the fixture no-op).
  await page.getByLabel("Repository to register").fill("not-a-repo");
  await page.getByRole("button", { name: "Add repo" }).click();
  await expect(page.getByText(/must be owner\/name/i)).toBeVisible();

  // Registered repos show doctor's protection verdict + a settings deep-link.
  const repoList = page.getByRole("list", { name: "Registered repos" });
  await expect(repoList).toContainText("you/myapp");
  await expect(page.getByRole("link", { name: /protect main/i }).first()).toHaveAttribute(
    "href",
    /github\.com\/you\/.*\/settings\/branches/,
  );

  // Live doctor checks: a pass, a fail WITH its fix hint.
  const checks = page.getByRole("list", { name: "Doctor checks" });
  await expect(checks).toContainText("fine-grained PAT");
  await expect(checks).toContainText("NO branch protection on main");

  // Doctor red → going live is locked, and it says why.
  await expect(page.getByRole("button", { name: /remove pause/i })).toBeDisabled();
  await expect(page.getByText(/until every doctor check is green/i)).toBeVisible();

  // The final step embeds the real session form — test ends where usage begins.
  await expect(page.getByRole("combobox", { name: "Repository" })).toBeVisible();
});

test("machine ready: go-live button is armed", async ({ page }) => {
  await signIn(page, "pm-linh");
  // normal scene: doctor all green but... paused=false → shows live state.
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
  await setScene(page, "fresh-install");
  await signIn(page, "pm-linh");

  await expect(page).toHaveURL(/\/setup/);
  await expect(page.getByText(/doctor has never run/i)).toBeVisible();
});

test("failing checks: login lands on /setup too", async ({ page }) => {
  await setScene(page, "something-wrong");
  await signIn(page, "pm-linh");

  await expect(page).toHaveURL(/\/setup/);
  await expect(page.getByRole("list", { name: "Doctor checks" })).toContainText(
    "NO branch protection on main",
  );
});
