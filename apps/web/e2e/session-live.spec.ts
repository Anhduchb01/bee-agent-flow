import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

/**
 * S7.3 — the whole session slice on the fixture, one pass:
 * create from the repo combobox → live text streams in → interject → stop.
 *
 * On the fixture, "create" lands on the demo running session (DEMO_SESSION_ID)
 * and the SSE route streams a REAL run.jsonl recorded by rig S0 — the
 * "XOAI-XANH" marker below is real CLI output, not an invented string.
 */
test("create from combobox, watch the stream, interject, stop", async ({ page }) => {
  await signIn(page, "pm-linh");
  await page.goto("/sessions");

  // Repo combobox: search lives INSIDE the dropdown (S7.1).
  await page.getByRole("combobox", { name: "Repository" }).click();
  const search = page.getByPlaceholder("Search repos…");
  await expect(search).toBeFocused();
  await search.fill("my");
  // "you/blog" is filtered out; the chat escape hatch stays pinned.
  await expect(page.getByRole("option", { name: "you/blog" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "No repo — just chat" })).toBeVisible();
  await page.getByRole("option", { name: "you/myapp" }).click();

  // No title box anywhere — the first message names the session instead.
  await expect(page.getByPlaceholder(/what do you want/i)).toHaveCount(0);
  await page.getByRole("button", { name: "New session" }).click();

  // Fixture drops us on the demo running session's live page.
  await expect(page).toHaveURL(/\/sessions\/de300000-0000-4000-8000-000000000001/);

  // Real text from the recorded run.jsonl arrives over SSE.
  const log = page.getByRole("log", { name: "Session events" });
  await expect(log).toContainText("XOAI-XANH", { timeout: 15_000 });

  // Interject mid-run: the box clears on success and shows no error.
  const input = page.getByLabel("Message to the agent");
  await input.fill("thêm cả nút export PDF nhé");
  await input.press("Enter");
  await expect(input).toHaveValue("");

  // Stop must not blow up the page; on the fixture the stream simply
  // stays open (a real stop is machine acceptance — S4).
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(log).toBeVisible();
});

/*
 * Not covered here: opening a chat at the newest message.
 *
 * It needs the conversation to overflow the viewport, and no fixture session
 * does — measured at 390x380, the log renders 149px tall, so every version of
 * this assertion passed whether the scroll hook existed or not. A test that
 * cannot fail is worse than no test, so the behaviour is pinned where it can
 * be driven honestly: use-chat-scroll.test.ts sets scrollHeight/clientHeight
 * itself and checks all three rules — open at the bottom, follow only from the
 * bottom, hold your place when history is prepended.
 */
