# AGENTS.md

Guide for any agent working **in this repository**. Read the section for the area
you are touching; ignore the rest.

> This file does **not** travel with the template. Someone copying `.claude/` into
> their own repo gets the skills and commands, not these conventions — that is
> deliberate. Their repo's conventions belong in their own `AGENTS.md`.

---

## 1. What is in here

Three parts, deliberately independent. Know which one you are in before you edit.

| Path | What it is | Stack |
|---|---|---|
| `.claude/` | Slash commands + skills. **A distributable artifact** — people copy it into their own repos. It also configures this repo (dogfooding) | Markdown only |
| `apps/reconciler/` | `bee` — polls GitHub every 30s and dispatches agent work on one Ubuntu machine | bash + systemd + `gh` + `jq` |
| `apps/web/` | The human face of `bee` — PM and Techlead open this instead of GitHub Issues | Next.js 16 |
| `docs/` | Design, specs, confirmed intent | Markdown + standalone HTML |

**Never mix concerns across these.** A change that touches both the reconciler and
the web app in one commit is almost always two changes.

---

## 2. Repo-wide rules

- **Read before you write.** `docs/architecture.html` is the whole system in one
  map; `docs/design/reconciler.md` is the detailed rationale. Most "why is it like
  this?" questions are answered there, usually with the trade-off spelled out.
- **`.claude/` stays stack-agnostic.** It describes *how to work* — spec first,
  tests lead, evidence before merge — so it applies to any language. Never add a
  framework, a language guide, or a product convention to it. That was removed
  once on purpose (`c1b1467`) and should not come back.
- Line endings are LF, enforced by `.gitattributes`.
- Docs are written in Vietnamese; files read by a model (prompts, this file) are
  written in English. Follow whichever the file you are editing already uses.

---

## 3. `apps/reconciler/` — bash

### The boundary that everything else exists to protect

Two OS users, and the separation is enforced by the kernel, not by convention:

| | `bee-orch` | `bee-agent` |
|---|---|---|
| `GH_TOKEN` | yes | **no** |
| group `docker` | yes | **no** |
| sudo | only to `agent-exec.sh` | **no** |
| Claude Code login | no | yes |

It must be two UIDs rather than two environment variables: the same UID can read
`/proc/<pid>/environ` of its parent, so filtering the environment on spawn
prevents nothing.

**`bee-agent` must never be in group `docker`.** Membership there is
root-equivalent — `docker run -v /:/host` reads the token and your home directory,
and the whole design collapses in one command leaving no trace.

### Rules for writing rule files

One file per rule, `rules/NN-name.sh`. **The filename number is the priority**, and
that order encodes a policy: *unblock a human first, take new work last.*

Every rule file declares:

| Symbol | Meaning |
|---|---|
| `RULE_ID` | Display name, e.g. `07-build` |
| `RULE_POOL` | `build` or `evidence` — which slot pool it draws from |
| `RULE_AGENT` | `1` if it calls the model, `0` if it is pure bash |
| `RULE_INLINE` | `1` to run inside the reconciler instead of a worker — only for a rule that is genuinely one API call |
| `rule_scan <slug>` | Prints candidates, one per line: `<number><TAB><priority 0\|1><TAB><title>` |
| `rule_run <slug> <num>` | Does the work. Runs inside `bee-task@<slug>-<num>.service`, never in the reconciler |

- **`rule_scan` must be read-only and fast** — it runs every 30 seconds for every
  repo, 2,880 times a day. Gate expensive API calls behind `scan_changed` on
  `updatedAt`. All long work belongs in `rule_run`.
- Candidates with priority `1` (label `priority:high`) sort first. Within the same
  priority the dispatcher sorts by **how many slots that repo already holds**,
  then by issue number — that is the whole fairness mechanism between repos.
- **Anything `orch` executes or interprets must come from `origin/HEAD`**, never
  from the worktree — use `from_main`. The agent can edit every file in the
  worktree, and orch has the token and docker. A compose file can declare
  `privileged: true`; a shell script needs to declare nothing at all.
- Anything the worker generates inside a worktree (`.env.test`, `test-results/`)
  must be cleaned up or excluded before `worktree_push_and_report` runs `git add
  -A`, or it lands in someone's pull request.
- Every retry path needs a counter and a ceiling. A rule that can match, fail, and
  match again forever burns model quota overnight with nobody watching. Check
  which counter you are incrementing — `worktree_push_and_report` resets the
  shared one.
- Comment the *why*, not the *what*. The existing files set the bar; match it.

### Verify like this

There is no test suite. Verify by building a rig with stubbed `gh`/`docker`/agent
and a real local git repo, then running the rule end to end. `bash -n` on every
script is the floor, not the goal.

Never test against a real repository or a real machine to "see if it works."

---

## 4. `apps/web/` — Next.js

### The boundary

This app must not become the hole in the reconciler's security design.

| MAY | MUST NOT |
|---|---|
| Read `/srv/bee/**` | Write anything under `/srv/bee/**` |
| Call GitHub **as the signed-in user** | Hold or read `GH_TOKEN` |
| Create issues, comments, labels, approvals | Merge a pull request |
| Read repo files to answer questions | Write to any worktree |
| — | Run `docker`, `systemctl`, `sudo`, or `bee` |

Three consequences people break by accident:

**Every GitHub write is signed by a real person.** There is no bot token here. A
label change, a comment, an approval — each goes out under the OAuth token of
whoever clicked, so the audit trail stays truthful. Not negotiable for convenience.

**It runs as its own user, `bee-web`** — group `bee` for read access, no docker,
no sudo, no token file. A third UID beside `bee-orch` and `bee-agent`. To make the
machine do something, change state on GitHub and let the reconciler pick it up.

**The reconciler is not modified from here.** If a feature seems to need a change
in `apps/reconciler/`, stop and raise it — separate change, separate review.

### Stack

Next.js 16.3 (App Router) · React 19.2 · TypeScript strict · **Tailwind v4** ·
shadcn/ui · TanStack Query · Zustand · Zod · NextAuth v5 · Vitest + Testing
Library + MSW · Playwright.

Next 16 specifics that break copied tutorials: `params`, `searchParams`,
`cookies()`, `headers()` are **async**; `proxy.ts` replaces `middleware.ts`;
`fetch` is **uncached by default** — leave it that way.

**Tailwind is v4, not v3.** There is no `tailwind.config.ts`: configuration is
CSS-first in `src/app/globals.css` via `@import "tailwindcss"` and `@theme
inline`. Tutorials that tell you to edit a JS config file are for v3.

**`shadcn` is a CLI, not a runtime dependency.** Use `pnpm dlx shadcn@latest add
<component>`; it must not appear in `dependencies`. Note that `shadcn init` wrote
an `@import "shadcn/tailwind.css"` line into `globals.css` that the published
package does not actually contain — it was removed, and `globals.css` carries the
full token set on its own. If a regeneration puts it back, delete it again.

The port is **3187** everywhere (`dev`, `start`, Playwright `baseURL`). 3000 and
3100 were already taken on the dev machine.

**Route handlers are the server.** There is no separate backend. They run on the
agent machine, read `/srv/bee/`, and call GitHub. Standing up a second service to
call back into the machine it already runs on adds a moving part and buys nothing.

Anything that reads the filesystem, holds a token, or shells out gets
`import "server-only"`. A client component importing one is a build error, and
that is the point.

### Layout

```
apps/web/src/
├── app/                    # ROUTING ONLY — keep thin
│   ├── (auth)/login/
│   ├── (app)/              # inbox · p/[slug] · t/[slug]/[num]
│   └── api/**/route.ts
├── features/               # ← most code lives here
│   └── <name>/{components,api,hooks,schemas}/ + index.ts
├── components/ui/          # shadcn primitives — CLI-generated, never hand-edit
├── components/             # domain-agnostic composites
├── lib/{bee,github}/       # server-only
└── proxy.ts
```

Alias `@/*` → `./src/*`. Never `../../..` across directories.

| Put a component in | When |
|---|---|
| `components/ui/` | shadcn primitive. Wrap it to extend; a regeneration overwrites edits |
| `components/` | Reusable and domain-ignorant. Test: would it compile in an unrelated product? |
| `features/<name>/components/` | Anything naming a business concept |
| `app/**/_components/` | One-off for exactly one route |

**Default to `features/`.** Promote when a *second* feature needs it, never on
prediction.

**Slices have a public API.** Cross-feature imports go through the barrel —
`@/features/tasks`, never `@/features/tasks/components/TaskRow`. Enforced by
ESLint `no-restricted-imports` on `@/features/*/*`; without it, "feature-sliced"
is just a folder name. No import cycles between features.

**`app/` stays thin.** A `page.tsx` reads params, checks access, renders a feature
component — 20–30 lines. Past ~100 lines the structure has started to fail. Every
route folder ships `loading.tsx` and `error.tsx`.

### Data

| | `/srv/bee/` | GitHub API |
|---|---|---|
| Trust | Derived cache, rewritten every tick | **Source of truth** |
| Access | Read-only, server-only, `lib/bee/` | As the signed-in user, `lib/github/` |

**`status.json` may be stale or missing, and the UI must say so rather than hide
it.** A heartbeat older than ten minutes means the reconciler may be dead — the
one failure mode with no red job to look at, and the most important thing this app
can tell anyone. Never render a stale number as if it were live.

Its TypeScript type lives in `lib/bee/types.ts` and is **kept in sync by hand**
with `apps/reconciler/bin/reconcile.sh`. Change one, change the other in the same
commit.

**Server state is fetched on the server.** Pages are Server Components that read
`lib/bee` and `lib/github` directly; writes are Server Actions that call
`revalidatePath`. Nothing in the browser fetches application data, so there is no
client cache to keep coherent — and `pnpm build` enforces it, because a Client
Component importing a `server-only` module is a build error.

**TanStack Query is installed but not yet wired**, and that is deliberate: adding
a `QueryClientProvider` that nothing reads would be a second data path to keep in
sync for no benefit. It enters when something genuinely needs client-side caching
across routes. The one place today that watches for change — the chat box waiting
for the agent to pick a comment up — uses `router.refresh()` on a 30 s interval,
matching the reconciler's tick, and stops as soon as the agent starts.

When Query does arrive: query keys are a factory per feature, never inline arrays
— an inline key drifts, and a drifted key means an invalidation that silently does
nothing. **Zustand is for transient UI state only**; copying server data into it
creates a second source of truth Query will not keep fresh. Call
`queryClient.clear()` on login and logout.

### Auth

- GitHub OAuth via NextAuth v5. The user's token lives in the **encrypted httpOnly
  session cookie only** and is **never exposed through `session()`** — route
  handlers read it server-side and call GitHub themselves. The browser never holds
  a token that can write.
- Access is an **allowlist of GitHub logins**. Anyone else authenticates fine and
  sees nothing.
- Route protection in `proxy.ts`, but **the proxy gate is UX, not security** —
  Next has shipped middleware-bypass CVEs (CVE-2025-29927). Every route handler
  re-checks the session.
- **NextAuth v5 ships under the `beta` dist-tag** (`5.0.0-beta.32` as of
  2026-08-13) — `latest` is still v4. Install it explicitly and **pin the exact
  version**; check the installed API rather than assuming. v4 patterns
  (`getServerSession`, `authOptions`, `[...nextauth].ts`) do not apply.

### Style and quality gates

**The design system is Geist, Vercel's** — see
[`docs/design/vercel-geist.md`](docs/design/vercel-geist.md) for the reasoning,
including the three places this app deliberately departs from vercel.com. The
short version: near-white canvas, near-black ink, 1px hairlines instead of
shadows, Geist Sans at tight negative tracking, uppercase Geist Mono eyebrows
labelling sections, 6px square buttons. **No pill buttons** — the pill belongs to
marketing surfaces and this app has none. Status colour lives in a 6px dot, a
1px border, and text; never in a fill wider than a badge.

**Change the look by changing tokens in `globals.css`**, not by hand-editing
`components/ui/` — a `shadcn add` regeneration overwrites edits there. The radius
scale is mapped so the shadcn primitives land on the right Geist value on their
own (`rounded-lg` → 6px, `rounded-xl` → 12px, `rounded-4xl` → pill).

Tailwind utilities only, **no `style={{}}`** (the one exception is the login
mesh gradient, which is a multi-stop composition no utility expresses). Merge
with `cn()` — later Tailwind classes do not automatically win. No hardcoded hex
or pixel values. Mobile-first; the inbox and the approve button must work on a
phone. Real `<button>` for actions, `<Link>` for navigation, labels tied to
inputs, visible focus rings.

`strict: true`, **`any` is forbidden** — use `unknown` and narrow. Zod validates
user input at the form boundary and nothing else.

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four before a task is done. **`pnpm build` is not optional** — it catches
Server/Client boundary violations that `dev` tolerates, and a task verified only
in dev mode is not verified.

Test behaviour, not implementation: query by role and label, never by test id.
Mock with **MSW**, never hand-stub `fetch`.

---

## 5. `docs/`

| Folder | Holds | Rule |
|---|---|---|
| `docs/architecture.html` | The whole system in one map | Entry point. Keep it accurate or delete it |
| `docs/design/` | Why each decision was made | Append; don't rewrite history of a decision |
| `docs/specs/` | One spec per component | Confirmed before code exists |
| `docs/intent/` | Confirmed product intent from an interview | **Never edit without re-confirming with the user** |
| `docs/mockups/` | Generated review artifacts | Generated, not hand-written — see the generator beside the source |
| `docs/templates/` | Things people copy | — |

Design docs argue; specs decide; intent records what the user actually said. When
they disagree, intent wins on *what*, specs win on *how*, and code wins on *what
is true today*.

---

## 6. Things that look like bugs but are decisions

- **The evidence pool is one slot, permanently.** Three Playwright runs at once
  time each other out, and flaky evidence is worse than slow evidence — it teaches
  reviewers to distrust the one thing that is supposed to be trustworthy.
- **The dashboard is a static file not served by the reconciler.** If the
  reconciler served its own status page, the page would go down exactly when you
  need it. Separate fates, stale heartbeat as the alarm.
- **No diff viewer and no line comments in `apps/web/`.** The Techlead reviews
  diffs on GitHub; building a worse one costs weeks.
- **No merge button anywhere.** Merge is a human action on GitHub. Always.
- **Rule 04 self-disables** in repos without `e2e-evidence-capture`. A rule that
  complains every 30 seconds is the fastest way to make people stop reading logs.
