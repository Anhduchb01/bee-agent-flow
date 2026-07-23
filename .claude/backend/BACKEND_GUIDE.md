# OmniLogin Backend Guide
> **For AI Agents:** This is your primary source of truth for all backend development in this repository. Ensure you adhere to these architectural, security, and integration rules at all times.

## 1. Project Overview & Architecture
This is a **production-ready FastAPI backend** following clean architecture principles.
- **Layers:** `Route → Service → Repository → Database`
- **Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2, Celery, Redis, RabbitMQ.
- **Domain:** Headless browser automation (OmniChromium/Patchright), profile management, and Native JWT authentication.

### Directory Layout
```
api/
├── main.py                        # App entry point
├── core/                          # Infrastructure (config.py, exceptions, middleware, celery_config)
├── database/                      # DB Managers (Postgres, Redis, RabbitMQ)
├── shared/                        # Reusable logic (decorators, enums, constants, schemas, services)
└── src/
    └── [module]/                  # Business domains (e.g., users, profiles)
        ├── models.py              # SQLAlchemy
        ├── schemas.py             # Pydantic 
        ├── repository.py          # Data Access
        ├── service.py             # Business Logic
        └── routes.py              # FastAPI Router
```

## 2. Authentication (Native JWT)
- **NO KEYCLOAK:** The system uses standalone native JWT generation and validation (`api/shared/services/auth_service.py`).
- **Security:** Use `passlib` (Argon2) for password hashing.
- **Middleware:** `request.state.user_id`, `request.state.user_role` are set by auth middleware.
- **Role Guards:** Use `@require_roles([])` and `@exclude_roles([])` from `api.shared.decorators.role_permission`.

## 3. Database Operations
- **Lifecycle:** Use `lifespan` in `api/main.py` for connecting to Postgres, Redis, and RabbitMQ. Never open connection pools inside request handlers.
- **ORM Only:** Use SQLAlchemy bounds. `N+1` queries must be avoided via eager loading (`selectinload`).
- **Data Isolation:** All queries must be scoped to the user/org if applicable.
- **Redis Namespace:** Cache keys must follow `RedisNamespace` enum (e.g. `RedisNamespace.USER_INFO`).

## 4. Background Tasks (Celery & RabbitMQ)
- Use Celery for any task exceeding API timeout specs (e.g., Browser automation launch, RPA execution).
- Worker queues: `default`, `high_priority`, `low_priority`, `crawlers`.
- **CRITICAL:** Celery tasks are synchronous and have their own thread pools. Always create a new **sync SQLAlchemy engine** inside the task. Do not share the async engine from FastAPI.

## 5. Security & Checks
- Secrets live in `.env` and `pydantic-settings`. Never hardcode keys.
- Input validation **must** be enforced via Pydantic at the `routes.py` level.
- Uploaded files must be processed via S3/MinIO. Never save files to the local container disk.
- Role enums are defined globally in `api/shared/enums/auth_roles.py`. Do not duplicate.

## 6. Notification System
Notifications follow a YAML template system stored in `api/shared/notifications/`.
- Load them at startup via `load_notification_templates()`.
- Trigger them via RabbitMQ using `api.shared.services.noti_producer.send_notification`.
