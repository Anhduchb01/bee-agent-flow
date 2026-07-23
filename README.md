# 🚀 template-vibecode

A **Claude Code vibecode template** for full-stack projects. It ships a curated set of **slash commands**, **agent skills**, **agent guides**, and a ready-to-fill **folder structure** so an AI agent can go from idea → spec → plan → build → review → ship with consistent conventions.

Reference stack: **FastAPI (Python 3.12)** backend + **Next.js 14 (App Router)** frontend + **Native JWT** auth. Full details live in [`.claude/AGENTS.md`](.claude/AGENTS.md).

---

## 📂 Folder Structure

```
template-vibecode/
├── README.md                  # ← You are here
│
├── backend/                   # FastAPI backend        → .claude/backend/BACKEND_GUIDE.md
├── frontend/                  # Next.js frontend       → .claude/frontend/FRONTEND_GUIDE.md
├── docs/                      # Specs, ADRs, project docs (incl. PRD_TEMPLATE.md)
├── infra/                     # Docker / IaC / deploy configs
│
└── .claude/
    ├── AGENTS.md                   # Full tech stack + conventions (read this first)
    ├── backend/BACKEND_GUIDE.md    # Backend rules of engagement for agents
    ├── frontend/FRONTEND_GUIDE.md  # Frontend rules of engagement for agents
    ├── commands/                   # Slash commands (*.md)
    └── skills/                     # Reusable agent skills (*/SKILL.md)
```

> `backend/`, `frontend/`, `docs/`, and `infra/` start as empty placeholders — scaffold them following the guides.

---

## 🧭 The Core Documents

| File | Purpose | Audience |
| --- | --- | --- |
| [`.claude/AGENTS.md`](.claude/AGENTS.md) | Full tech stack, architecture, cross-cutting rules | Every agent, every task |
| [`.claude/backend/BACKEND_GUIDE.md`](.claude/backend/BACKEND_GUIDE.md) | Backend architecture, auth, DB, Celery, security | Backend tasks |
| [`.claude/frontend/FRONTEND_GUIDE.md`](.claude/frontend/FRONTEND_GUIDE.md) | Next.js conventions, state, forms, styling | Frontend tasks |

**Rule of thumb:** always read `AGENTS.md` + the relevant `*_GUIDE.md` before coding.

---

## ⚡ Slash Commands

Defined in [`.claude/commands/`](.claude/commands/). Type them in Claude Code to drive the workflow.

| Command | What it does | Backing skill |
| --- | --- | --- |
| `/spec` | Write a structured specification before writing code | `spec-driven-development` |
| `/plan` | Break work into small verifiable tasks with acceptance criteria + dependency order → `tasks/plan.md`, `tasks/todo.md` | `planning-and-task-breakdown` |
| `/build` | Implement the next pending task (TDD: RED → GREEN → verify → commit), then stop | `incremental-implementation` + `test-driven-development` |
| `/build auto` | Plan + build the whole spec in one approved autonomous pass (one commit per task) | same as above |
| `/test` | TDD for features; **Prove-It** pattern for bug fixes (reproduce → fix → regress) | `test-driven-development` |
| `/review` | Five-axis code review: correctness, readability, architecture, security, performance | `code-review-and-quality` |
| `/code-simplify` | Reduce complexity without changing behavior | `code-simplification` |
| `/webperf` | Web performance audit (Deep mode with Lighthouse/CrUX, else Quick mode) | via `web-performance-auditor` persona |
| `/ship` | Pre-launch fan-out to 3 parallel personas → merged **go/no-go** + rollback plan | `shipping-and-launch` |

### Recommended flow

```
/spec  →  /plan  →  /build (loop)  →  /test  →  /review  →  /ship
                                              ↘  /code-simplify  /webperf  (as needed)
```

---

## 🛠️ Agent Skills

Reusable capability packs in [`.claude/skills/`](.claude/skills/). Claude auto-invokes the right one for a task, or you can request it by name.

**Workflow & delivery**
- `spec-driven-development` — specs before code
- `planning-and-task-breakdown` — ordered, verifiable tasks
- `incremental-implementation` — land changes one slice at a time
- `test-driven-development` — tests drive the code
- `shipping-and-launch` — pre-launch checklist + rollout
- `git-workflow-and-versioning` — branching, commits, releases
- `ci-cd-and-automation` — pipelines & quality gates

**Quality & safety**
- `code-review-and-quality` — multi-axis review
- `code-simplification` — clarity without behavior change
- `security-and-hardening` — untrusted input, auth, storage
- `debugging-and-error-recovery` — root-cause debugging
- `doubt-driven-development` — adversarial verification of risky decisions
- `performance-optimization` — frontend/backend/query perf

**Design & docs**
- `api-and-interface-design` — stable API/module boundaries
- `frontend-ui-engineering` — accessible, production-quality UI
- `browser-testing-with-devtools` — verify in a real browser (Chrome DevTools MCP)
- `documentation-and-adrs` — record decisions
- `observability-and-instrumentation` — logging/metrics/tracing
- `deprecation-and-migration` — sunset & migrate safely

**Thinking & context**
- `idea-refine` — sharpen vague ideas
- `interview-me` — extract true intent from underspecified asks
- `context-engineering` — configure rules & context
- `source-driven-development` — ground work in official docs
- `using-agent-skills` — meta-skill for discovering the rest

---

## 🤖 Agent Personas (`agents/`)

`/ship` and `/webperf` fan out to specialist subagent personas. Each `agents/<name>.md` becomes a callable `<name>` tool.

| Persona | Used by | Role |
| --- | --- | --- |
| `code-reviewer` | `/ship` | Five-axis review |
| `security-auditor` | `/ship` | OWASP / threat-model / CVE pass |
| `test-engineer` | `/ship` | Coverage-gap analysis |
| `web-performance-auditor` | `/webperf` | Perf scorecard + ranked findings |

> These aren't in the template yet — create an `agents/` directory with these personas to enable the full `/ship` and `/webperf` fan-out. User-level definitions override plugin defaults automatically.

---

## 🏁 Getting Started

1. **Read** [`.claude/AGENTS.md`](.claude/AGENTS.md) to absorb the stack and rules.
2. **Scaffold** `backend/` and `frontend/` per their guides.
3. **Write the PRD:** copy [`docs/PRD_TEMPLATE.md`](docs/PRD_TEMPLATE.md) → `docs/PRD_<feature>.md` and fill it in.
4. **Kick off a feature:** run `/spec` (turns the PRD into a technical spec), then `/plan`.
5. **Build:** loop `/build` (or `/build auto` after approving the plan).
6. **Verify & ship:** `/test` → `/review` → `/ship`.

---

## 🧱 Tech Stack (at a glance)

**Backend** — Python 3.12 · FastAPI · SQLAlchemy 2.0 (async) · Alembic · Pydantic v2 · Celery · RabbitMQ · Redis · PostgreSQL · Native JWT (Argon2) · S3/MinIO

**Frontend** — Next.js 14 (App Router) · TypeScript · Tailwind · Shadcn UI · Framer Motion · TanStack React Query · Zustand · React Hook Form + Zod · NextAuth

**Infra** — Docker / Docker Compose · `.env` + pydantic-settings · Claude Code agent tooling

Full details and cross-cutting rules → [`.claude/AGENTS.md`](.claude/AGENTS.md).
