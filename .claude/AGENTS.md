# AGENTS.md

> **For AI Agents (Claude Code, Cursor, Copilot, etc.):** This is the single source of truth for the entire tech stack, architecture, and conventions of this project. Read it fully before writing any code. Domain-specific rules live in [`backend/BACKEND_GUIDE.md`](backend/BACKEND_GUIDE.md) and [`frontend/FRONTEND_GUIDE.md`](frontend/FRONTEND_GUIDE.md) — always consult the relevant guide alongside this file.

---

## 1. Project Overview

**OmniLogin** — a production-grade full-stack application built with the **bee-agent-flow template** (Claude Code skills + slash commands + agent guides).

- **Domain:** Headless browser automation (OmniChromium/Patchright), profile management, proxy handling, and Native JWT authentication.
- **Architecture:** Clean layered architecture on the backend, feature-sliced design on the frontend.
- **Delivery model:** The frontend runs locally and talks to a local FastAPI engine (`http://localhost:8000`) that acts as the desktop's native engine.

### Repository Layout

```
bee-agent-flow/
├── README.md                 # Human-facing template guide
├── backend/                  # FastAPI backend (see .claude/backend/BACKEND_GUIDE.md)
├── frontend/                 # Next.js frontend (see .claude/frontend/FRONTEND_GUIDE.md)
├── docs/                     # Project docs, ADRs, specs (incl. PRD_TEMPLATE.md)
├── infra/                    # Docker, IaC, deployment configs
└── .claude/
    ├── AGENTS.md                   # ← You are here — full tech stack + conventions
    ├── backend/BACKEND_GUIDE.md    # Backend rules of engagement
    ├── frontend/FRONTEND_GUIDE.md  # Frontend rules of engagement
    ├── commands/*.toml             # Slash commands (/build, /spec, /ship, ...)
    └── skills/*/SKILL.md           # Reusable agent skills
```

---

## 2. Full Tech Stack

### 2.1 Backend

| Concern | Technology |
| --- | --- |
| Language | **Python 3.12** |
| Web framework | **FastAPI** (async) |
| ORM | **SQLAlchemy 2.0** (async) |
| Migrations | **Alembic** |
| Validation / schemas | **Pydantic v2** + **pydantic-settings** |
| Async task queue | **Celery** |
| Message broker | **RabbitMQ** |
| Cache / KV store | **Redis** |
| Primary database | **PostgreSQL** |
| Auth | **Native JWT** (no Keycloak) — `python-jose` / native, **passlib (Argon2)** for hashing |
| Object storage | **S3 / MinIO** |
| Browser automation | **OmniChromium / Patchright** |
| Notifications | **YAML template system** dispatched over RabbitMQ |

**Layering:** `Route → Service → Repository → Database`. Never skip a layer.

**Directory layout (backend):**
```
api/
├── main.py            # App entry point + lifespan (DB/Redis/RabbitMQ pools)
├── core/              # config.py, exceptions, middleware, celery_config
├── database/          # Postgres, Redis, RabbitMQ managers
├── shared/            # decorators, enums, constants, schemas, services, notifications
└── src/[module]/      # Business domains (users, profiles, proxies, ...)
    ├── models.py      # SQLAlchemy
    ├── schemas.py     # Pydantic
    ├── repository.py  # Data access
    ├── service.py     # Business logic
    └── routes.py      # FastAPI router
```

### 2.2 Frontend

| Concern | Technology |
| --- | --- |
| Framework | **Next.js 14+** (App Router) |
| Language | **TypeScript** (strict — `any` forbidden) |
| Styling | **Tailwind CSS** + **Shadcn UI** |
| Animation | **Framer Motion** |
| Server state | **TanStack React Query** |
| UI state | **Zustand** (transient UI only — never API data) |
| Forms | **React Hook Form** + **Zod** |
| Auth | **NextAuth** (Credentials Provider, backed by Native JWT) |
| Utilities | `cn()` from `lib/utils` for class merging |

**Directory layout (frontend):**
```
frontend/
├── app/               # App Router pages (layout.tsx, page.tsx)
├── src/
│   ├── components/    # Shared UI (Shadcn, primitives)
│   ├── features/      # Feature-sliced modules (profiles, proxies, ...)
│   ├── hooks/         # Custom React hooks
│   ├── lib/           # auth, api client, formatters
│   ├── schemas/       # Zod schemas
│   └── store/         # Zustand stores
└── public/            # Static assets
```

### 2.3 Infrastructure & Tooling

| Concern | Technology |
| --- | --- |
| Containerization | **Docker / Docker Compose** (`infra/`) |
| Secrets | `.env` files loaded via `pydantic-settings` — never hardcoded |
| Local integration | Frontend (`:3000`) ↔ FastAPI engine (`:8000`) — mind CORS/proxy |
| CI/CD | See `ci-cd-and-automation` skill |
| Agent tooling | **Claude Code** — skills, slash commands, subagent personas |

---

## 3. Authentication (Native JWT — end to end)

There is **no Keycloak** anywhere in this stack.

- **Backend:** standalone JWT generation/validation in `api/shared/services/auth_service.py`. Passwords hashed with `passlib` (Argon2). Auth middleware sets `request.state.user_id` and `request.state.user_role`. Guard routes with `@require_roles([])` / `@exclude_roles([])` from `api.shared.decorators.role_permission`. Roles are defined once in `api/shared/enums/auth_roles.py`.
- **Frontend:** **NextAuth Credentials Provider**. `access_token` + `refresh_token` stored in the session; `jwt()`/`session()` callbacks in `auth.ts` attach `accessToken` to the client. On expiry, a silent refresh rotates against `/auth/refresh` on the FastAPI server.

---

## 4. Cross-Cutting Rules (apply to all code)

1. **Layer discipline** — backend: Route → Service → Repository → DB. Frontend: feature-sliced, component-first (no 1000-line files).
2. **Validation everywhere** — Pydantic at `routes.py` on the backend; Zod on every form on the frontend.
3. **No secrets in code** — `.env` + `pydantic-settings` only.
4. **Connection lifecycle** — open DB/Redis/RabbitMQ pools in `lifespan`, never inside request handlers.
5. **Avoid N+1** — eager-load with `selectinload`.
6. **Celery is sync** — always create a fresh **sync** SQLAlchemy engine inside a task; never reuse the FastAPI async engine.
7. **Files go to S3/MinIO** — never write uploads to container disk.
8. **Data isolation** — scope every query to the user/org where applicable.
9. **Strict typing** — no `any` on the frontend; typed everything on the backend.
10. **State placement** — React Query for API data, Zustand for UI-only state.

---

## 5. How Agents Should Work Here

- Use the **slash commands** in `.claude/commands/` to drive the workflow: `/spec` → `/planning` → `/build` → `/test` → `/review` → `/ship`. See [README.md](../README.md) for the full catalog.
- Invoke the matching **skill** in `.claude/skills/` when a task fits (e.g. `test-driven-development`, `security-and-hardening`, `performance-optimization`).
- The `/ship` and `/webperf` commands expect specialist **subagent personas** in an `agents/` directory (`code-reviewer`, `security-auditor`, `test-engineer`, `web-performance-auditor`). Create them there if they don't exist yet.
- Before any change: read this file + the relevant `*_GUIDE.md`. After any change: run tests and the build, then use `/review`.
