# 🐝 bee-agent-flow

Nền tảng để AI agent tự chạy vòng đời phát triển phần mềm — từ ý tưởng → spec →
plan → build → review → ship — theo một bộ quy ước nhất quán.

Gồm **ba phần dùng được độc lập**:

| Phần | Là gì | Trạng thái |
|---|---|---|
| **Template cho Claude Code** — [`.claude/`](.claude/) | Bộ slash command và agent skill. Copy vào repo của bạn là dùng được ngay | Dùng được |
| **`bee` — reconciler** — [`apps/reconciler/`](apps/reconciler/) | Điều phối agent chạy tự động trên một máy Ubuntu. GitHub là nguồn sự thật, agent tự nhận issue và mở PR kèm bằng chứng | Code xong, **chưa nghiệm thu trên máy thật** |
| **`web` — app cho PM & Techlead** — [`docs/specs/web.md`](docs/specs/web.md) | Mặt người dùng đặt lên trên `bee`: mở nó thay vì mở GitHub Issues | Mới có spec |

> **Bắt đầu đọc ở đâu:** [`docs/architecture.html`](docs/architecture.html) — toàn
> bộ hệ thống trong một bản đồ, mở bằng trình duyệt.

---

## 📂 Cấu trúc

```
bee-agent-flow/
├── AGENTS.md                  # Quy ước cho agent làm việc TRÊN repo này
├── README.md                  # ← Bạn đang ở đây
│
├── apps/
│   ├── reconciler/            # `bee` — bash + systemd, cài lên máy Ubuntu
│   │   ├── bin/ lib/ rules/   # dispatcher, worker, 9 rule
│   │   ├── prompts/           # prompt của 4 vai trò agent
│   │   ├── public/            # dashboard tĩnh
│   │   └── systemd/ sudoers/  # unit, ranh giới quyền
│   └── web/                   # Next.js 16 — chưa scaffold, xem docs/specs/web.md
│
├── docs/
│   ├── architecture.html      # ← bản đồ toàn hệ thống
│   ├── design/                # lý lẽ: vì sao chọn từng phương án
│   ├── specs/                 # đặc tả từng phần
│   ├── intent/                # ý định đã chốt qua phỏng vấn
│   ├── mockups/               # bản duyệt giao diện (sinh tự động)
│   └── templates/             # mẫu để copy
│
├── .claude/                   # template: commands/ + skills/
└── .github/                   # issue template, PR template (KHÔNG có workflows/)
```

`.github/` không có `workflows/` — hệ quả trực tiếp của việc chọn reconciler thay
vì GitHub Actions.

**`.claude/` vừa là template vừa là cấu hình của chính repo này.** Nó cố ý không
mang stack nào: skill và slash command ở đó nói về *cách làm việc*, dùng được với
Python, TypeScript, Go hay bất cứ thứ gì. Quy ước riêng của từng dự án nằm trong
`AGENTS.md` của chính repo đó.

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
| `/ship` | Fan-out 3 persona → quyết định go/no-go + kế hoạch rollback | `shipping-and-launch` |

```
/spec  →  /plan  →  /build (lặp)  →  /test  →  /review  →  /ship
                                            ↘  /code-simplify  /webperf  (khi cần)
```

> `/ship` và `/webperf` cần thư mục `agents/` chứa persona — template chưa kèm sẵn.

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

## 🐝 `bee` — chạy agent tự động

Phần trên là bạn ngồi gõ slash command. Phần này là để agent tự làm, không cần ai
ngồi trước máy.

Một tiến trình trên máy Ubuntu, cứ **30 giây** đối chiếu trạng thái trên GitHub
với thực tế rồi làm **đúng một việc** để kéo hai bên về gần nhau. Không GitHub
Actions, không webhook — hàng đợi chính là label trên issue, nên máy tắt ba tiếng
cũng không mất việc nào.

### Cài

```bash
git clone git@github.com:org/bee-agent-flow.git ~/bee-src
sudo ~/bee-src/apps/reconciler/install.sh      # idempotent, --no-deps để bỏ qua cài gói
```

Cài xong hệ thống **nằm im** (`/etc/bee/PAUSE` được tạo sẵn). Còn 5 việc cần
người, script in ra ở cuối:

```bash
sudo -u bee-agent -H claude        # /login  ← ĐÚNG user này
sudo -u bee-orch  -H gh auth login
sudo $EDITOR /etc/bee/orch.env     # GH_TOKEN fine-grained, KHÔNG cấp Workflows
be repo add org/ten-repo
be doctor && be dry-run && be resume
```

### Dùng hằng ngày

| Lệnh | |
|---|---|
| `bee` | trạng thái — gõ trống là ra ngay |
| `bee -w` | theo dõi liên tục trong terminal |
| `be doctor` | kiểm tra toàn bộ, gồm cả các ranh giới bảo mật |
| `be dry-run` | xem nó **định** làm gì mà chưa làm gì |
| `be logs myapp-42` | log của một task |
| `be pause` | kill switch |

Kill switch có hai tầng: `/etc/bee/PAUSE` (ngay, cần SSH) và `.agent/PAUSE` trên
nhánh `main` của từng repo (PM tạo qua web GitHub trong 10 giây, lưu vết trong
lịch sử git).

### Vòng đời một task

PM tạo issue → agent chấm độ rõ của spec → người duyệt → agent build và mở draft
PR → CI + E2E quay video → PM xem video, Techlead soi diff → cả hai approve →
**người bấm merge**. Agent không bao giờ được merge, và không cầm credential nào
để push thẳng `main`.

### Nghiệm thu M0 — làm trước khi cho agent chạy thật

```bash
be doctor                                 # mọi mục ✓
be dry-run                                # in ra nó ĐỊNH làm gì

sudo -u bee-agent env | grep -i token     # phải RỖNG
id -nG bee-agent | grep -w docker         # phải RỖNG
sudo -u bee-agent -n true                 # phải FAIL

systemctl start bee-task@test-1           # lần 2 khi đang chạy: BỊ TỪ CHỐI
journalctl -u bee-reconcile -n 50         # tick đều, không chồng nhau
```

Bỏ qua mốc này thì lúc agent ra kết quả sai bạn sẽ không phân biệt được lỗi ở
prompt hay ở hạ tầng của chính mình — debug hai ẩn số cùng lúc.

### Đã làm tới đâu

| Rule | |
|---|---|
| 01 recover · 02 review · 03 CI · 04 evidence · 05 approvals · 07 build · 08 spec · 09 reindex | có |
| 06 preview | mốc M6 — mới có phần scan |

Repo đích cần thêm: `scripts/ci.sh` (rule 03), `infra/docker-compose.test.yml`
(nếu test cần Postgres/Redis), `.claude/skills/e2e-evidence-capture/` (rule 04 —
thiếu thì rule tự tắt, không cảnh báo).

Chi tiết thiết kế: [`docs/design/reconciler.md`](docs/design/reconciler.md) ·
kiến trúc: [`docs/architecture.html`](docs/architecture.html)

---

## 💻 `web` — app cho PM & Techlead

Máy chạy 24/7. **Người mới là chỗ nghẽn** — nghẽn ở đúng ba cửa: duyệt spec, cho
phép agent nhận task, approve PR. Agent làm xong lúc 2 giờ sáng rồi nằm chờ tới 9
giờ, không phải vì máy chậm mà vì không ai biết.

Nên màn hình chính không phải một cái board. Nó là **hộp thư "đang chờ bạn"**,
xếp theo thời gian đã chờ, cộng một tin Slack để bạn không phải nhớ mở app.

| Làm được | Không làm |
|---|---|
| Hộp thư chờ bạn, mọi dự án | Xem diff |
| Tạo task theo hợp đồng 5 mục | Comment theo dòng |
| Chat vào task — nối lại đúng phiên agent cũ | Merge |
| Xem video bằng chứng ngay trong trang | |
| PM duyệt bằng token GitHub của chính mình | |

Chạy trên chính máy agent dưới user riêng `bee-web`: thuộc group `bee` để đọc,
**không có `GH_TOKEN`, không sudo, không docker.** Mọi thao tác ghi lên GitHub
dùng token OAuth của đúng người vừa bấm — không có token bot dùng chung, nên lịch
sử GitHub luôn nói đúng ai đã làm gì.

Ý định đã chốt: [`docs/intent/pm-app.md`](docs/intent/pm-app.md) ·
đặc tả: [`docs/specs/web.md`](docs/specs/web.md) ·
mockup dashboard: [`docs/mockups/dashboard.html`](docs/mockups/dashboard.html)

---

## 🏁 Bắt đầu

**Dùng template trong dự án của bạn** — copy `.claude/` vào repo đích (thêm
`.github/` nếu repo đó sẽ do `bee` quản):

1. **Viết PRD:** copy [`docs/templates/prd.md`](docs/templates/prd.md) →
   `docs/PRD_<tinh-nang>.md` rồi điền vào.
2. **Khởi động:** `/spec` (biến PRD thành spec kỹ thuật) → `/plan`.
3. **Build:** lặp `/build`, hoặc `/build auto` sau khi đã duyệt plan.
4. **Kiểm tra & ship:** `/test` → `/review` → `/ship`.

> Quy ước riêng của dự án — layering, thư viện được phép dùng, những gì đã thử và
> fail — viết vào `AGENTS.md` của **chính repo đó**, không viết vào template.

**Chạy `bee` để agent tự làm** — xem mục trên.

---

## 🧱 Chạy trên gì

Chỉ phần điều phối mới có stack cố định, và nó cố ý mỏng: **bash + systemd + `gh`
+ `jq`**, cộng Docker để dựng service test và Playwright để quay bằng chứng. Không
framework, không runtime, không cơ sở dữ liệu — kể cả dashboard cũng chỉ là một
file `status.json` tĩnh do reconciler ghi ra.

Chọn vậy vì thứ này phải sống sót qua reboot, mất điện và những đêm không ai
trông; càng ít bộ phận chuyển động thì càng ít thứ hỏng lúc 2 giờ sáng.

`apps/web/` là Next.js — nó là app cho người, không nằm trong đường găng của
agent, và máy tắt thì cả hai đều dừng nên nó không thêm chế độ hỏng mới.

Dự án mà `bee` quản thì dùng stack gì cũng được.
