# 🚀 template-vibecode

Một **template vibecode cho Claude Code** dành cho các dự án full-stack. Template cung cấp sẵn bộ **slash command**, **agent skill**, **agent guide**, và một **cấu trúc thư mục** điền-là-chạy, giúp AI agent đi từ ý tưởng → spec → plan → build → review → ship theo một bộ quy ước nhất quán.

Stack tham chiếu: backend **FastAPI (Python 3.12)** + frontend **Next.js 14 (App Router)** + xác thực **Native JWT**. Chi tiết đầy đủ nằm ở [`.claude/AGENTS.md`](.claude/AGENTS.md).

---

## 📂 Cấu trúc thư mục

```
template-vibecode/
├── README.md                  # ← Bạn đang ở đây
│
├── backend/                   # Backend FastAPI      → .claude/backend/BACKEND_GUIDE.md
├── frontend/                  # Frontend Next.js     → .claude/frontend/FRONTEND_GUIDE.md
├── docs/                      # Spec, ADR, tài liệu dự án (gồm PRD_TEMPLATE.md)
├── infra/                     # Cấu hình Docker / IaC / deploy
│
└── .claude/
    ├── AGENTS.md                   # Toàn bộ tech stack + quy ước (đọc file này trước)
    ├── backend/BACKEND_GUIDE.md    # Quy tắc làm việc backend cho agent
    ├── frontend/FRONTEND_GUIDE.md  # Quy tắc làm việc frontend cho agent
    ├── commands/                   # Slash command (*.md)
    └── skills/                     # Agent skill tái sử dụng (*/SKILL.md)
```

> `backend/`, `frontend/`, `docs/`, và `infra/` ban đầu là các thư mục placeholder rỗng — hãy dựng khung (scaffold) theo các guide tương ứng.

---

## 🧭 Các tài liệu cốt lõi

| File | Mục đích | Đối tượng |
| --- | --- | --- |
| [`.claude/AGENTS.md`](.claude/AGENTS.md) | Toàn bộ tech stack, kiến trúc, quy tắc xuyên suốt | Mọi agent, mọi task |
| [`.claude/backend/BACKEND_GUIDE.md`](.claude/backend/BACKEND_GUIDE.md) | Kiến trúc backend, auth, DB, Celery, bảo mật | Task backend |
| [`.claude/frontend/FRONTEND_GUIDE.md`](.claude/frontend/FRONTEND_GUIDE.md) | Quy ước Next.js, state, form, styling | Task frontend |

**Nguyên tắc vàng:** luôn đọc `AGENTS.md` + `*_GUIDE.md` liên quan trước khi viết code.

---

## ⚡ Slash Command

Được định nghĩa trong [`.claude/commands/`](.claude/commands/). Gõ chúng trong Claude Code để điều khiển quy trình làm việc.

| Command | Chức năng | Skill đứng sau |
| --- | --- | --- |
| `/spec` | Viết đặc tả (specification) có cấu trúc trước khi code | `spec-driven-development` |
| `/plan` | Chia nhỏ công việc thành các task kiểm chứng được, kèm tiêu chí nghiệm thu + thứ tự phụ thuộc → `tasks/plan.md`, `tasks/todo.md` | `planning-and-task-breakdown` |
| `/build` | Làm task kế tiếp đang chờ (TDD: RED → GREEN → verify → commit), rồi dừng | `incremental-implementation` + `test-driven-development` |
| `/build auto` | Plan + build toàn bộ spec trong một lượt tự động (đã duyệt), mỗi task một commit | như trên |
| `/test` | TDD cho tính năng mới; mẫu **Prove-It** cho việc sửa bug (tái hiện → sửa → chống hồi quy) | `test-driven-development` |
| `/review` | Review code 5 trục: correctness, readability, architecture, security, performance | `code-review-and-quality` |
| `/code-simplify` | Giảm độ phức tạp mà không đổi hành vi | `code-simplification` |
| `/webperf` | Audit hiệu năng web (Deep mode với Lighthouse/CrUX, nếu không thì Quick mode) | qua persona `web-performance-auditor` |
| `/ship` | Fan-out song song trước khi release tới 3 persona → tổng hợp quyết định **go/no-go** + kế hoạch rollback | `shipping-and-launch` |

### Luồng khuyến nghị

```
/spec  →  /plan  →  /build (lặp)  →  /test  →  /review  →  /ship
                                             ↘  /code-simplify  /webperf  (khi cần)
```

---

## 🛠️ Agent Skill

Các gói năng lực tái sử dụng trong [`.claude/skills/`](.claude/skills/). Claude tự động gọi skill phù hợp cho từng task, hoặc bạn có thể yêu cầu theo tên.

**Quy trình & bàn giao (Workflow & delivery)**
- `spec-driven-development` — spec trước, code sau
- `planning-and-task-breakdown` — task có thứ tự, kiểm chứng được
- `incremental-implementation` — đưa thay đổi vào từng phần nhỏ
- `test-driven-development` — test dẫn dắt code
- `shipping-and-launch` — checklist trước release + rollout
- `git-workflow-and-versioning` — branch, commit, release
- `ci-cd-and-automation` — pipeline & cổng chất lượng

**Chất lượng & an toàn (Quality & safety)**
- `code-review-and-quality` — review đa trục
- `code-simplification` — rõ ràng mà không đổi hành vi
- `security-and-hardening` — input không tin cậy, auth, lưu trữ
- `debugging-and-error-recovery` — debug tận gốc
- `doubt-driven-development` — kiểm chứng đối kháng cho quyết định rủi ro
- `performance-optimization` — hiệu năng frontend/backend/query

**Thiết kế & tài liệu (Design & docs)**
- `api-and-interface-design` — ranh giới API/module ổn định
- `frontend-ui-engineering` — UI production, có accessibility
- `browser-testing-with-devtools` — kiểm thử trên trình duyệt thật (Chrome DevTools MCP)
- `documentation-and-adrs` — ghi lại các quyết định
- `observability-and-instrumentation` — logging/metrics/tracing
- `deprecation-and-migration` — gỡ bỏ & migrate an toàn

**Tư duy & bối cảnh (Thinking & context)**
- `idea-refine` — mài sắc ý tưởng còn mơ hồ
- `interview-me` — bóc tách ý định thật từ yêu cầu chưa rõ
- `context-engineering` — cấu hình rule & context
- `source-driven-development` — bám tài liệu chính thống
- `using-agent-skills` — meta-skill để khám phá các skill còn lại

---

## 🤖 Agent Persona (`agents/`)

`/ship` và `/webperf` fan-out tới các persona subagent chuyên biệt. Mỗi `agents/<name>.md` trở thành một tool `<name>` có thể gọi được.

| Persona | Dùng bởi | Vai trò |
| --- | --- | --- |
| `code-reviewer` | `/ship` | Review 5 trục |
| `security-auditor` | `/ship` | Rà OWASP / threat-model / CVE |
| `test-engineer` | `/ship` | Phân tích khoảng trống test coverage |
| `web-performance-auditor` | `/webperf` | Bảng điểm hiệu năng + danh sách vấn đề xếp hạng |

> Các persona này chưa có sẵn trong template — hãy tạo thư mục `agents/` với chúng để bật đầy đủ fan-out của `/ship` và `/webperf`. Định nghĩa ở cấp người dùng (user-level) sẽ tự động ghi đè bản mặc định của plugin.

---

## 🏁 Bắt đầu (Getting Started)

1. **Đọc** [`.claude/AGENTS.md`](.claude/AGENTS.md) để nắm stack và quy tắc.
2. **Dựng khung** `backend/` và `frontend/` theo guide tương ứng.
3. **Viết PRD:** copy [`docs/PRD_TEMPLATE.md`](docs/PRD_TEMPLATE.md) → `docs/PRD_<tinh-nang>.md` rồi điền vào.
4. **Khởi động một tính năng:** chạy `/spec` (biến PRD thành spec kỹ thuật), rồi `/plan`.
5. **Build:** lặp `/build` (hoặc `/build auto` sau khi đã duyệt plan).
6. **Kiểm tra & ship:** `/test` → `/review` → `/ship`.

---

## 🧱 Tech Stack (tổng quan nhanh)

**Backend** — Python 3.12 · FastAPI · SQLAlchemy 2.0 (async) · Alembic · Pydantic v2 · Celery · RabbitMQ · Redis · PostgreSQL · Native JWT (Argon2) · S3/MinIO

**Frontend** — Next.js 14 (App Router) · TypeScript · Tailwind · Shadcn UI · Framer Motion · TanStack React Query · Zustand · React Hook Form + Zod · NextAuth

**Infra** — Docker / Docker Compose · `.env` + pydantic-settings · công cụ agent Claude Code

Chi tiết đầy đủ và các quy tắc xuyên suốt → [`.claude/AGENTS.md`](.claude/AGENTS.md).
