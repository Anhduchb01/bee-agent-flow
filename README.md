# 🐝 bee-agent-flow

**Claude Code trên web — treo 24/7, mở từ bất cứ đâu kể cả điện thoại.** Quản
lý n phiên agent theo từng repo: nói ý tưởng, agent phỏng vấn, nói *"ok làm
đi"*, nhìn nó làm live, gõ chen, dừng — hoặc thả việc rồi đi ngủ. Issue, PR,
push là việc agent tự làm bằng skill.

Gồm các phần dùng được độc lập:

| Phần | Là gì | Trạng thái |
|---|---|---|
| **Template cho Claude Code** — [`.claude/`](.claude/) | Bộ slash command và agent skill. Copy vào repo của bạn là dùng được ngay | Dùng được |
| **`runner` — nền chạy phiên** — [`apps/runner/`](apps/runner/) | Phiên agent là systemd unit: sống qua đóng trình duyệt, tự dọn khi chết, kiểm vệ sinh A+ | **Đang xây** — S0 (rig hai ẩn số) đã xong |
| **`web` — mặt điều khiển** — [`apps/web/`](apps/web/) | Danh sách phiên theo repo, xem live, gõ chen, dừng, duyệt | 15 feature slice trên fixture · đang chuyển sang session-first |
| **`bee` reconciler** — [`apps/reconciler/`](apps/reconciler/) | Mô hình cũ (hai UID, hàng đợi nhãn, tick 30s) | **Đóng băng làm fallback** — nhánh `feat/bee-m3-and-web-spec` |

> **Bắt đầu đọc ở đâu:** [`docs/PRD_bee-agent-flow.md`](docs/PRD_bee-agent-flow.md)
> (3.0 — muốn gì, và vì sao chọn mô hình một UID) ·
> [`docs/specs/session-first.md`](docs/specs/session-first.md) (làm thế nào) ·
> [`docs/architecture.html`](docs/architecture.html) (toàn hệ thống trong một bản đồ).

---

## 🧭 Mô hình trong ba câu

1. **Phiên là đối tượng gốc.** Một phiên = một lần Claude Code chạy trong một
   worktree, sống như một systemd unit — web chỉ là người đọc file và bấm nút.
   Task, issue, PR là *sản phẩm phụ* của phiên, do agent tự tạo bằng `gh`.
2. **Ranh giới là vỏ máy + hàng rào phía GitHub, không phải UID.** Máy chuyên
   dụng không chứa gì đáng lấy; agent cầm fine-grained PAT phạm vi hẹp; `main`
   có branch protection — đường duy nhất vào main là nút merge người bấm.
   Quyết định này (gọi là **A+**) kèm cái giá chấp nhận có ý thức và **5 cò
   súng** buộc quay về mô hình hai UID — xem [PRD §0](docs/PRD_bee-agent-flow.md).
3. **Trạng thái sống trên đĩa.** Đầu ra phiên rơi thẳng xuống `run.jsonl`,
   đầu vào qua FIFO — đóng trình duyệt, restart web, `kill -9` đều không mất gì.

---

## 📂 Cấu trúc

```
bee-agent-flow/
├── AGENTS.md                  # Quy ước cho agent làm việc TRÊN repo này
├── README.md                  # ← Bạn đang ở đây
│
├── apps/
│   ├── runner/                # MỚI — nền chạy phiên (bash + systemd user units)
│   │   └── rig/               # rig gỡ ẩn số + fixture run.jsonl thật (S0 ✓)
│   ├── web/                   # Next.js 16 — mặt điều khiển
│   └── reconciler/            # mô hình cũ — đóng băng làm fallback
│
├── docs/
│   ├── PRD_bee-agent-flow.md  # ← NGUỒN Ý ĐỊNH (3.0, session-first)
│   ├── specs/session-first.md # ← SPEC ĐANG HIỆU LỰC
│   ├── specs/v1-live.md       # spec mô hình cũ (đóng băng, §3 còn giá trị)
│   ├── architecture.html      # bản đồ toàn hệ thống
│   ├── design/                # lý lẽ: vì sao chọn từng phương án
│   ├── intent/ mockups/ templates/
│   └── …
│
├── tasks/                     # plan.md (S0→S5) + todo.md
├── .claude/                   # template: commands/ + skills/
└── .github/                   # issue/PR template (KHÔNG có workflows/)
```

**`.claude/` vừa là template vừa là cấu hình của chính repo này.** Nó cố ý
không mang stack nào: skill và slash command nói về *cách làm việc*, dùng được
với mọi ngôn ngữ. Quy ước riêng của từng dự án nằm trong `AGENTS.md` của chính
repo đó.

---

## ⚡ Slash Command

Định nghĩa trong [`.claude/commands/`](.claude/commands/).

| Command | Chức năng | Skill đứng sau |
| --- | --- | --- |
| `/spec` | Viết đặc tả có cấu trúc trước khi code | `spec-driven-development` |
| `/plan` | Chia nhỏ thành task kiểm chứng được + thứ tự phụ thuộc | `planning-and-task-breakdown` |
| `/build` | Làm task kế tiếp (TDD: RED → GREEN → verify → commit) rồi dừng | `incremental-implementation` + `test-driven-development` |
| `/build auto` | Plan + build toàn bộ spec trong một lượt đã duyệt | như trên |
| `/test` | TDD cho tính năng mới; **Prove-It** cho sửa bug | `test-driven-development` |
| `/review` | Review 5 trục: correctness, readability, architecture, security, performance | `code-review-and-quality` |
| `/code-simplify` | Giảm độ phức tạp mà không đổi hành vi | `code-simplification` |
| `/webperf` | Audit hiệu năng web | persona `web-performance-auditor` |
| `/ship` | Fan-out 3 persona → go/no-go + kế hoạch rollback | `shipping-and-launch` |

```
/spec  →  /plan  →  /build (lặp)  →  /test  →  /review  →  /ship
                                            ↘  /code-simplify  /webperf  (khi cần)
```

---

## 🛠️ Agent Skill

24 gói năng lực trong [`.claude/skills/`](.claude/skills/). Claude tự gọi skill
phù hợp, hoặc bạn yêu cầu theo tên.

**Quy trình & bàn giao** — `spec-driven-development` · `planning-and-task-breakdown` ·
`incremental-implementation` · `test-driven-development` · `shipping-and-launch` ·
`git-workflow-and-versioning` · `ci-cd-and-automation`

**Chất lượng & an toàn** — `code-review-and-quality` · `code-simplification` ·
`security-and-hardening` · `debugging-and-error-recovery` ·
`doubt-driven-development` · `performance-optimization`

**Thiết kế & tài liệu** — `api-and-interface-design` · `frontend-ui-engineering` ·
`browser-testing-with-devtools` · `e2e-evidence-capture` · `documentation-and-adrs` ·
`observability-and-instrumentation` · `deprecation-and-migration`

**Tư duy & bối cảnh** — `idea-refine` · `interview-me` · `context-engineering` ·
`source-driven-development` · `using-agent-skills`

---

## 🖥️ Vòng đời một phiên

```
Mở app → chọn repo → New session
  → CHẾ ĐỘ PHỎNG VẤN (không tool): nói ý tưởng, agent hỏi lại
  → "ok làm đi"                        ← cửa chặn duy nhất = chuyển chế độ
  → CHẾ ĐỘ LÀM (đủ tool, cùng phiên): sửa code trong worktree, chạy test,
    tự tạo issue, tự push branch bee/<slug>-<n>, tự mở draft PR
  → xem live · gõ chen · dừng — từ điện thoại
  → duyệt và merge (V2), mang tên người bấm
```

Hai điểm đã **chứng minh bằng rig trên máy thật** (S0, 17/08 —
[`apps/runner/rig/FINDINGS.md`](apps/runner/rig/FINDINGS.md)):

- Gõ chen lúc agent đang giữa một tool call: **CLI xếp hàng và tiếp thu** — ô
  gõ được phép hứa "agent sẽ đọc".
- Phỏng vấn không tool → `--resume` với đủ tool: **phiên nhớ nguyên hợp đồng**
  — "ok làm đi" thật sự là một phiên, hai chế độ.

## 🔒 Vệ sinh A+ — điều kiện tiên quyết, `doctor` kiểm

1. Máy chuyên dụng đúng nghĩa: không SSH key đi nơi khác, không secret nào
   ngoài PAT + login Claude; `.env` production không nằm trên máy, không nằm trong repo.
2. Fine-grained PAT: đúng danh sách repo, đúng 3 quyền (contents · PR · issues).
3. Branch protection `main` từng repo — push thẳng bị từ chối với **mọi** token.
4. Cloudflare Access + GitHub OAuth allowlist ở cửa trước.
5. Xem billing Claude + audit log GitHub mỗi sáng.

Vi phạm dòng nào trong **5 cò súng** ([PRD §0.2](docs/PRD_bee-agent-flow.md)) —
repo public, thêm người, đọc comment người ngoài, máy chứa secret khác, code
cho khách — thì dừng nhận việc và quay về mô hình hai UID ở nhánh fallback.

---

## 🏁 Bắt đầu

**Dùng template trong dự án của bạn** — copy `.claude/` vào repo đích:

1. **Viết PRD:** copy [`docs/templates/prd.md`](docs/templates/prd.md) →
   `docs/PRD_<tinh-nang>.md` rồi điền.
2. **Khởi động:** `/spec` → `/plan`.
3. **Build:** lặp `/build`, hoặc `/build auto` sau khi duyệt plan.
4. **Kiểm tra & ship:** `/test` → `/review` → `/ship`.

**Chạy hệ thống phiên** — đang xây theo [`tasks/plan.md`](tasks/plan.md)
(S0 ✓ → S1 runner ∥ S2 web → S3 nối → S4 máy thật → S5 internet). Hướng dẫn
cài sẽ nằm ở `apps/runner/install.sh` khi S1 xong.

---

## 🧱 Chạy trên gì

Phần nền cố ý mỏng: **bash + systemd user units + `gh` + `jq`** — không
framework, không database, không webhook. Trạng thái là file trên đĩa. Chọn
vậy vì thứ này phải sống sót reboot, mất điện và những đêm không ai trông;
càng ít bộ phận chuyển động thì càng ít thứ hỏng lúc 2 giờ sáng.

`apps/web/` là Next.js — app cho người, chạy cùng máy cùng user, đọc đĩa trực
tiếp; máy tắt thì cả hai cùng dừng nên nó không thêm chế độ hỏng mới.

Dự án mà hệ thống này quản thì dùng stack gì cũng được.
