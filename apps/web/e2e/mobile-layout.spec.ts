import { devices, expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

/**
 * iPhone 13 Pro Max (428 × 926 CSS px) — nothing may scroll SIDEWAYS.
 *
 * Two different failures wear the same symptom on a phone, so both are
 * checked here:
 *
 *  - the DOCUMENT grows past the viewport (a flex child without `min-w-0`);
 *  - a PANEL grows past itself. `overflow-y: auto` computes overflow-x to
 *    `auto` too, so the chat's message area starts sliding under the thumb
 *    the moment one 260-character path lands in it — the document stays
 *    428px wide and a desktop review sees nothing wrong.
 *
 * A container is allowed to scroll sideways only if it says so: `<pre>`,
 * `<table>`, or `data-scroll-x` (the chip rails, the kanban carousel). That
 * attribute is the contract — anything else that scrolls is a bug.
 */

/**
 * Playwright's own iPhone 13 Pro Max descriptor: 428 CSS px wide, 746 tall
 * once Safari's chrome is taken off, `isMobile` so the page really sees a
 * COARSE pointer. Run on chromium (the project's browser) — this is a
 * layout audit, not a WebKit-engine one.
 */
test.use({ ...devices["iPhone 13 Pro Max"], defaultBrowserType: "chromium" });

/** The chat with everything a phone hates — see fixture.ts WIDE_SESSION_ID. */
const WIDE_CHAT = "/sessions/de300000-0000-4000-8000-0000000000ff";

const ROUTES = [
  "/",
  "/sessions",
  "/sessions/de300000-0000-4000-8000-000000000001",
  WIDE_CHAT,
  "/projects",
  "/projects?view=kanban",
  "/brief",
  "/canvas",
  "/setup?tab=install",
  "/setup?tab=config",
  // The PR review page — the link GitHub sends you to, opened on a phone.
  "/pr/myapp/123",
];

type Report = { width: number; docScroll: number; spill: string[]; scrollers: string[] };

async function audit(page: Page): Promise<Report> {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 70)}`;

    const clipped = (el: Element) => {
      let p = el.parentElement;
      while (p !== null && p !== document.documentElement) {
        if (getComputedStyle(p).overflowX !== "visible") return true;
        p = p.parentElement;
      }
      return false;
    };
    const mayScroll = (el: Element) =>
      el.tagName === "PRE" ||
      el.tagName === "TABLE" ||
      el.closest("[data-scroll-x]") !== null ||
      el.closest(".react-flow") !== null;

    const spill: string[] = [];
    const scrollers: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > w + 1 && !clipped(el)) {
        spill.push(`${name(el)} right=${Math.round(r.right)}`);
      }
      const ox = getComputedStyle(el).overflowX;
      if (
        (ox === "auto" || ox === "scroll") &&
        el.scrollWidth > el.clientWidth + 1 &&
        !mayScroll(el)
      ) {
        scrollers.push(`${name(el)} sw=${el.scrollWidth} cw=${el.clientWidth}`);
      }
    }
    return { width: w, docScroll: document.documentElement.scrollWidth, spill, scrollers };
  });
}

for (const route of ROUTES) {
  test(`no sideways scroll: ${route}`, async ({ page }) => {
    await signIn(page, "pm-linh");
    await page.goto(route);
    // The chat arrives over SSE — assert on what has landed, not on an
    // empty log that would pass for the wrong reason.
    if (route.startsWith("/sessions/de3")) {
      await expect(page.getByRole("log", { name: "Session events" })).not.toBeEmpty();
    }
    await page.waitForTimeout(2500);

    const r = await audit(page);
    expect(r.spill, `elements past the right edge on ${route}`).toEqual([]);
    expect(r.scrollers, `panels scrolling sideways on ${route}`).toEqual([]);
    expect(r.docScroll, `document scrolls sideways on ${route}`).toBeLessThanOrEqual(r.width + 1);
  });
}

/** The first screen anyone sees on the phone, before any session exists. */
test("no sideways scroll: /login", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const r = await audit(page);
  expect(r.spill, "elements past the right edge on /login").toEqual([]);
  expect(r.docScroll).toBeLessThanOrEqual(r.width + 1);
});

/**
 * Rotated. Landscape is not a second design here — it is the same one with
 * 428px of height, where a sticky header plus a composer can eat the whole
 * screen — so the chat is checked for the one thing that would make it
 * unusable: no room left to read.
 */
test("landscape still reads and still does not slide", async ({ page }) => {
  await signIn(page, "pm-linh");
  await page.setViewportSize({ width: 926, height: 428 });
  await page.goto(WIDE_CHAT);
  await expect(page.getByRole("log", { name: "Session events" })).not.toBeEmpty();
  await page.waitForTimeout(1500);

  const r = await audit(page);
  expect(r.spill, "elements past the right edge in landscape").toEqual([]);
  expect(r.scrollers, "panels scrolling sideways in landscape").toEqual([]);

  const room = await page.evaluate(() => {
    const log = document.querySelector<HTMLElement>("[role=log]")!;
    const r = log.parentElement!.getBoundingClientRect();
    return { height: r.height, width: r.width };
  });
  expect(room.height, "height left for the conversation in landscape").toBeGreaterThan(150);
  // And the sidebar is off-canvas: 256px of permanent chrome on a 926px
  // phone screen is a third of it, spent on navigation nobody is reading.
  expect(room.width, "width left for the conversation in landscape").toBeGreaterThan(880);
});

/**
 * `overflow-x-hidden` on the message area would pass the test above by
 * CUTTING the long path off instead of wrapping it — a worse bug, and an
 * invisible one. So measure the other direction too: inside the chat,
 * nothing may reach past the panel it is painted in, unless it is a code
 * block or a table that scrolls on its own.
 */
test("the wide chat cuts nothing off", async ({ page }) => {
  await signIn(page, "pm-linh");
  await page.goto(WIDE_CHAT);
  await expect(page.getByRole("log", { name: "Session events" })).not.toBeEmpty();
  await page.waitForTimeout(2000);

  const cut = await page.evaluate(() => {
    const log = document.querySelector<HTMLElement>("[role=log]")!;
    const edge = log.getBoundingClientRect().right;
    const out: string[] = [];
    for (const el of log.querySelectorAll<HTMLElement>("*")) {
      if (el.closest("pre, table, [data-scroll-x]") !== null) continue;
      const r = el.getBoundingClientRect();
      const label = `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)}`;
      if (r.width > 0 && r.right > edge + 1) {
        out.push(`${label} right=${Math.round(r.right)} edge=${Math.round(edge)}`);
        continue;
      }
      // The box can sit inside the panel while its TEXT hangs out of it —
      // an unbreakable path in a <p> moves no element rect at all. Only
      // `scrollWidth` sees that, and only where nothing clips it (a
      // `truncate` span is overflow:hidden and is meant to be cut).
      if (getComputedStyle(el).overflowX !== "visible") continue;
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        out.push(`${label} sw=${el.scrollWidth} cw=${el.clientWidth}`);
      }
    }
    return out;
  });
  expect(cut, "chat content painted past the panel edge").toEqual([]);
});

/**
 * The composer is the bottom-most thing on the most important screen, and
 * `viewportFit: "cover"` puts the page under the home indicator. Chromium
 * reports `env(safe-area-inset-bottom)` as 0 here, so the inset itself
 * cannot be measured — assert both halves of what can be: the send button
 * is fully on screen with clearance, and the inset is still declared.
 */
test("the send button clears the bottom edge", async ({ page }) => {
  await signIn(page, "pm-linh");
  await page.goto(WIDE_CHAT);

  const send = page.getByRole("button", { name: "Send" });
  await expect(send).toBeVisible();
  const box = (await send.boundingBox())!;
  const height = await page.evaluate(() => window.innerHeight);
  expect(box.y + box.height, "send button bottom vs the viewport").toBeLessThanOrEqual(height - 8);
  expect(box.height, "send button is a thumb target").toBeGreaterThanOrEqual(40);

  const declared = await page.evaluate(() => {
    const composer = document.querySelector("[data-slot=textarea]")!.closest("form")!.parentElement!;
    return composer.className.includes("safe-area-inset-bottom");
  });
  expect(declared, "composer still declares the safe-area inset").toBe(true);
});

/**
 * Thumb targets. Apple's minimum is 44×44pt and this app used to hand a
 * phone 27px close buttons and 17px links — hittable with a mouse, a
 * coin-flip with a thumb, and Allow/Deny sat 9px apart at 28px tall.
 *
 * Two things are exempt, and both say so in the markup rather than in a
 * list that rots here:
 *
 *  - `[data-prose]` — a link inside a sentence. Making it 44px tall breaks
 *    the line it lives in; typography wins, and the link is still hit by
 *    pressing the words.
 *  - `.react-flow` — the canvas scales its own contents with the zoom, so
 *    a node's link is 3px at "fit view" and 30px at 100%. Size there is a
 *    property of the zoom, not of the CSS.
 */
const TARGET_ROUTES = [
  "/",
  "/sessions",
  WIDE_CHAT,
  "/projects",
  "/projects?view=kanban",
  "/brief",
  "/setup?tab=install",
  "/setup?tab=config",
];

for (const route of TARGET_ROUTES) {
  test(`thumb-sized controls: ${route}`, async ({ page }) => {
    await signIn(page, "pm-linh");
    await page.goto(route);
    if (route.startsWith("/sessions/de3")) {
      await expect(page.getByRole("log", { name: "Session events" })).not.toBeEmpty();
    }
    await page.waitForTimeout(2500);

    const small = await page.evaluate(() => {
      const out: string[] = [];
      const sel = "button, a[href], input:not([type=hidden]), select, summary, [role=button]";
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        if (el.closest("[data-prose], .react-flow") !== null) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height >= 43.5) continue;  // 2.75rem lands on 43.68 at this root size
        const label = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40);
        out.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return [...new Set(out)];
    });
    expect(small, `controls under 44px on ${route}`).toEqual([]);
  });
}
