---
name: e2e-evidence-capture
description: Runs E2E tests that record video and screenshots, drives failures to green, then publishes artifacts from the passing run to MinIO and emits a PR evidence block. Use when a task has UI-visible acceptance criteria, when preparing a pull request body, when a reviewer asks to see the feature working, or when a bug fix needs proof of the before/after behavior.
---

# E2E Evidence Capture

## Overview

A green test suite proves the code runs. It does not prove the feature does what the acceptance criteria asked for — a reviewer still has to read the test to believe it. This skill closes that gap: every acceptance criterion with a visible outcome gets a recorded run, and the PR carries a link to the video of that exact run.

The recording is a byproduct of the test, not a separate step. You do not "run tests, then make a demo". You run the tests with the camera on, and when they pass, the footage you already have becomes the demo.

## When to Use

- A task's acceptance criteria describe something a user can see or do
- Opening a PR that touches UI, a user-facing flow, or an API with a visible effect
- Fixing a bug — capture the failing behavior first, then the fixed behavior
- A reviewer or PM asks "show me it working" on an open PR
- Any automated agent run that must leave behind proof a human can check in 30 seconds

**When NOT to use:** pure refactors with no behavior change, backend-internal changes with no observable surface, infra/config-only PRs. For these, a green CI run is sufficient evidence — do not manufacture a video to look thorough.

## The Core Rule

> **Evidence may only come from a run where every test passed.**

There is exactly one green run per PR update, and its artifacts are the evidence. Never publish footage from a partially-passing run. Never publish footage from run A alongside a green result from run B. Never hand-assemble a video from multiple runs. If the suite went red, the correct action is to fix the code and record again from scratch — a re-record is cheap, a misleading PR is not.

## The Loop

```
1. WRITE / UPDATE SPECS
   └── One spec per acceptance criterion, named after it
       └── Assertions come from the AC text, not from current behavior

2. RUN WITH CAMERA ON
   └── npx playwright test  (video: 'on', trace: 'retain-on-failure')
       │
       ├── RED ──► 3. DIAGNOSE
       │            ├── Open the trace: npx playwright show-trace <path>
       │            ├── Watch the video of the failing run — it usually shows the cause
       │            ├── Read app + server logs for the same timestamp
       │            └── Identify root cause (app bug? test bug? environment?)
       │                    │
       │                    ▼
       │           4. FIX  ── app bug     → fix the source
       │                   ├─ test bug    → fix the test, but re-read the AC first
       │                   └─ env problem → fix setup/fixtures, never the assertion
       │                    │
       │                    └──► back to 2 (discard all artifacts from the red run)
       │
       └── GREEN ──► 5. CONFIRM IT'S NOT FLAKY
                     └── npx playwright test --repeat-each=3
                         └── Any failure here = still red. Back to 3.

6. PUBLISH
   └── scripts/publish-evidence.sh — convert, upload to MinIO, print markdown

7. ATTACH
   └── Update the PR body's evidence block (replace, never append)
```

Step 5 is not optional. A test that passes 2 times out of 3 is a broken test, and shipping its video as evidence is worse than shipping no video — it teaches reviewers to trust something unreliable.

## Writing Specs That Double as Demos

A test recorded for evidence has a second audience: a human watching at 1x speed. Write it so the footage is legible.

```ts
// e2e/ac-2-expired-token-redirects.spec.ts
//
// AC-2: Given a user with an expired token, when they open /dashboard,
//       then they are redirected to /login with an "expired session" notice.

import { test, expect } from '@playwright/test'
import { seedUserWithExpiredToken } from './fixtures/auth'

test('AC-2 — expired token redirects to login with notice', async ({ page }) => {
  await seedUserWithExpiredToken(page)

  await test.step('open the dashboard', async () => {
    await page.goto('/dashboard')
  })

  await test.step('lands on login with the expired-session notice', async () => {
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('alert')).toHaveText(/phiên đăng nhập đã hết hạn/i)
  })
})
```

Rules that make the difference:

- **One spec file per AC**, filename prefixed with the AC id. The publish script uses that prefix to map artifacts back to checkboxes in the PR body.
- **Use `test.step()` for each user-visible beat.** Steps appear in the trace timeline and in the HTML report, so a reviewer can jump straight to the moment that matters.
- **Assert on roles and visible text**, not CSS classes or test-ids alone. If the assertion would still pass with the UI visually broken, it is not evidence of the AC.
- **Slow down only where it matters.** Do not add global sleeps to make videos watchable — they make the suite slow and flaky. If a transition is too fast to see, that is what the trace is for.
- **Neutralize non-determinism** — freeze the clock, seed fixed data, stub third-party calls. A video full of "2 minutes ago" timestamps and random names makes diffs between runs unreadable.
- **Never assert on data the test did not create.** Shared state is the single biggest source of flake in E2E.

## Playwright Configuration

Start from [`playwright.config.template.ts`](playwright.config.template.ts) in this skill directory. The parts that matter for evidence:

| Setting | Value | Why |
|---|---|---|
| `video` | `'on'` | Always record. `retain-on-failure` gives you footage only when you don't want it. |
| `trace` | `'retain-on-failure'` | Traces are large; you only need them while debugging. |
| `screenshot` | `'only-on-failure'` | Named AC screenshots are taken explicitly in-test instead. |
| `outputDir` | `test-results/` | Everything the publish script reads lives here. |
| `retries` | `0` locally, `0` in the evidence run | Retries hide flake. Use `--repeat-each` to expose it instead. |
| `workers` | `1` for the evidence run | Parallel workers interleave server logs and make videos harder to correlate. |

Videos are written as `.webm` only after the browser context closes, so the files do not exist until the run finishes. Do not try to read them mid-test.

For explicit AC screenshots inside a test:

```ts
await page.screenshot({ path: `test-results/shots/ac-2-after.png`, fullPage: true })
```

Take before/after pairs for anything visual, and repeat at mobile width (`390×844`) whenever the AC mentions responsive behavior.

## Fixing Failures — What You May and May Not Do

When the suite is red, there is enormous pull toward the fastest path to green. Most of those paths destroy the value of the evidence.

| Never | Instead |
|---|---|
| Weaken an assertion so it passes | Fix the code. If the AC is genuinely wrong, stop and ask the human — do not silently redefine it. |
| `test.skip()` / `test.fixme()` a failing AC | A skipped AC is an unmet AC. Report it as blocked. |
| Raise `retries` until it passes | Retries mask flake. Find the race. |
| Add `waitForTimeout()` to "stabilize" | Wait for the actual condition: `expect(locator).toBeVisible()`, `waitForResponse`, `waitForURL`. |
| Delete the failing test | The strongest possible signal that something is wrong. |
| Publish the video from the red run because "it mostly worked" | Re-record after the fix. |
| Change the AC text in the issue to match what the code does | The AC belongs to the PM. Comment on the issue and wait. |

Legitimate test-side fixes exist — a wrong selector, a missing fixture, a bad assumption about seed data. The test for legitimacy is simple: **after the fix, does the test still fail if you break the feature on purpose?** If not, you fixed the test into meaninglessness. Verify by temporarily reverting the source change and confirming the test goes red.

## Publishing to MinIO

Run [`scripts/publish-evidence.sh`](scripts/publish-evidence.sh) after a confirmed-green run. It converts, uploads, and prints the markdown block.

```bash
./scripts/publish-evidence.sh --pr 42 --run "$GITHUB_RUN_ID"
```

What it does, and why each part exists:

- **`.webm` → `.mp4`** (`libx264`, `yuv420p`, `+faststart`) — webm does not play in every browser and mobile client a reviewer might use.
- **`.mp4` → a short `.gif`** (two-pass palettegen, ~10 fps, 720px wide) — GitHub renders `![](url.gif)` inline. It does **not** render a player for a video hosted on an external host, so a bare mp4 link means the reviewer must download to see anything. The GIF is the preview; the mp4 is the full-quality link.
- **Upload path** `s3://<bucket>/pr-<N>/<run-id>/…` — run-scoped so re-runs never overwrite older evidence. A reviewer following an old link still sees what they reviewed.
- **Prints markdown**, does not touch the PR itself. Publishing and attaching stay separate so a failed upload can never half-update a PR body.

### Bucket setup (once)

```bash
mc alias set evidence "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mb --ignore-existing evidence/pr-evidence
mc anonymous set download evidence/pr-evidence
```

**Use a dedicated bucket.** `mc anonymous set download` makes the whole bucket world-readable — never point it at the application's asset bucket. Presigned URLs are not a workaround here: S3 v4 signatures cap at 7 days, and PR evidence needs to outlive the review.

Anything a reviewer sees, the internet can see. Never record a flow containing real customer data, production secrets, or live tokens. Seed fixtures only.

### Retention

Evidence accumulates fast — a 30-second video is a few MB, and a busy repo produces dozens per week. Set a lifecycle rule so it expires:

```bash
mc ilm rule add --expire-days 90 evidence/pr-evidence
```

90 days outlives any review while keeping the bucket bounded. If a PR's evidence matters permanently, the video is the wrong artifact — write it down in an ADR.

## The PR Evidence Block

The script emits this. Paste it into the PR body between the markers.

```markdown
<!-- evidence:start -->
## Bằng chứng

| AC | Kết quả | Video | Ảnh |
|---|---|---|---|
| AC-1 — user đăng nhập được | ✅ pass | [mp4](https://…/ac-1.mp4) | [before](…) · [after](…) |
| AC-2 — token hết hạn redirect | ✅ pass | [mp4](https://…/ac-2.mp4) | [after](…) |

![AC-2 demo](https://…/ac-2.gif)

`8/8 passed` · `--repeat-each=3 · không flake` · run [`17482910`](…) · commit `a1b2c3d`
<!-- evidence:end -->
```

**Always replace the block, never append.** A PR with three stale evidence blocks is worse than one with none — a reviewer cannot tell which reflects the current head. Update with `gh pr edit`, rewriting only the region between the markers.

State the commit SHA in the block. Evidence recorded against a commit that is no longer the PR head is expired, and a reviewer needs to be able to notice that without asking.

## In CI (self-hosted runner)

```yaml
- name: E2E with recording
  run: npx playwright test --workers=1
  # no continue-on-error — red must fail the job

- name: Confirm no flake
  run: npx playwright test --repeat-each=3 --workers=1

- name: Publish evidence
  if: success()          # ← the whole point: only a green run publishes
  env:
    MINIO_ENDPOINT:   ${{ secrets.MINIO_ENDPOINT }}
    MINIO_ACCESS_KEY: ${{ secrets.MINIO_ACCESS_KEY }}
    MINIO_SECRET_KEY: ${{ secrets.MINIO_SECRET_KEY }}
  run: ./scripts/publish-evidence.sh --pr ${{ github.event.pull_request.number }} --run ${{ github.run_id }}
```

On failure, upload the traces as a GitHub artifact instead so the next debugging pass has something to open. Keep them out of MinIO — failure traces are debugging material, not evidence.

## Red Flags

- A PR claiming an AC is met with no artifact and no explanation of why one isn't needed
- Evidence block whose commit SHA is not the PR head
- Video published from a run where any test failed
- `--repeat-each` skipped because "it passed the first time"
- Assertions loosened in the same commit as the fix they were supposed to catch
- `waitForTimeout` appearing anywhere in the suite
- Multiple evidence blocks stacked in one PR body
- Evidence bucket shared with application assets
- A recorded flow containing real user data or a live token
- Tests passing against a stale build because the dev server wasn't restarted

## Verification

Before marking a task done:

- [ ] Every AC with a visible outcome has an artifact, or a stated reason it doesn't need one
- [ ] All artifacts come from one single green run
- [ ] `--repeat-each=3` passed
- [ ] Breaking the feature on purpose makes the relevant test fail (assertions are real)
- [ ] Evidence block SHA matches the PR head commit
- [ ] Exactly one evidence block in the PR body
- [ ] Links resolve anonymously (open one in a private window)
- [ ] No real user data, secrets, or live tokens visible in any frame
