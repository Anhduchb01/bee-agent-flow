# SPEC — V1 Sessions Live (mô hình session-first, một UID)

Đặc tả kỹ thuật cho mốc **V1** của [`docs/PRD_bee-agent-flow.md`](../PRD_bee-agent-flow.md)
bản 3.0: Epic 1 · Epic 2 · FR-6.1 → FR-6.6.

**Đầu vào đã chốt:** PRD 3.0 (mô hình A+, §0.1) · [`AGENTS.md`](../../AGENTS.md)
**Trạng thái:** bản nháp đầu, chờ duyệt. Chưa viết dòng code nào cho mô hình mới.
**Thừa kế:** phần đường-ra/đường-vào lấy nguyên từ
[`v1-live.md`](v1-live.md) §3 — thứ đó đúng bất kể mô hình UID.

---

## 0. Những gì spec này KHÔNG làm

- Không sudo, không polkit, không socket qua UID, không broker — mô hình A+
  chạy **một user `bee`** cho cả web lẫn phiên agent.
- Không hàng đợi, không chạy đêm (V3). Không nút merge (V2).
- Không đụng vào `apps/reconciler/` — nó đóng băng làm fallback. Code mới nằm ở
  `apps/runner/`.

---

## 1. Mục tiêu — ba câu kiểm được

1. Từ lúc bấm tới **sự kiện đầu tiên** trên màn: **< 5 giây** (sự kiện vòng đời
   tính là sự kiện — "worktree đang dựng" là chữ, không bắt model phải nhanh).
2. Đóng trình duyệt 10 phút: phiên **vẫn chạy**, mở lại xem tiếp từ chỗ đang
   tới, không mất khúc giữa.
3. `systemctl restart bee-web` giữa lúc agent làm: phiên **không hề hấn**.

Câu 2 và 3 là lý do phiên phải là systemd unit và đầu ra phải nằm trên đĩa —
hai thứ này thừa kế nguyên từ mô hình cũ.

---

## 2. Kiến trúc

### 2.1 Một user, linger, user units

```
user `bee` (loginctl enable-linger bee)
├── bee-web.service            web app (user unit hoặc system unit User=bee)
├── bee-session@<id>.service   MỘT PHIÊN — template user unit
├── bee-reaper.timer           dọn xác, mỗi 30s
└── bee-heartbeat.timer        tự kiểm sức khoẻ
```

- Web start/stop phiên bằng `systemctl --user start bee-session@<id>` — cùng
  UID nên **không cần sudo, không cần cầu**. Đây là toàn bộ phần "vượt ranh
  giới" của mô hình cũ, giờ còn một dòng.
- Khoá trùng miễn phí: start một unit đang active bị systemd từ chối.
- `linger` để user units sống không cần ai đăng nhập. `doctor` kiểm.

### 2.2 Đường đi của một phiên

```
Trình duyệt
   │ ① POST /api/session/start   ② GET /api/session/<id>/stream (SSE)
   │ ③ POST /api/session/<id>/say            ④ POST /api/session/<id>/stop
   ▼
bee-web (user bee)
   │ ① ghi  /srv/bee/sessions/<id>/session.json  rồi  systemctl --user start bee-session@<id>
   │ ② tail /srv/bee/sessions/<id>/run.jsonl     (chỉ đọc file, như mô hình cũ)
   │ ③ ghi  $XDG_RUNTIME_DIR/bee/<id>.in         (FIFO)
   │ ④ systemctl --user stop bee-session@<id>
   ▼
bee-session@<id> → session-run.sh
   ├─ đọc session.json  (repo, mode, prompt đầu, worktree?, resume?)
   ├─ kiểm PAUSE — có thì từ chối ngay, ghi lý do vào run.jsonl rồi thoát
   ├─ fetch bare clone → branch bee/<slug>-<n> → git worktree add
   ├─ phát sự kiện vòng đời vào run.jsonl  ("worktree đang dựng", "phiên đã khởi động")
   └─ claude -p … --input-format stream-json --output-format stream-json
        --include-partial-messages --session-id <uuid>
        <&FIFO  > >(tee -a run.jsonl)  2>stderr.log
```

**Bốn quyết định giữ nguyên từ v1-live §3 (kèm lý do gốc):**

1. **FIFO mở read-write** (`exec 3<>`): FIFO chỉ-đọc nhận EOF khi người ghi
   cuối đóng → claude thoát giữa chừng. Giữ một fd ghi của chính mình là cách
   bắt nó không bao giờ thấy EOF.
2. **`run.jsonl` ghi thẳng vào chỗ bền từ dòng đầu tiên** — không có cửa sổ
   thời gian nào mà dữ liệu chỉ tồn tại ở chỗ sẽ bị xoá.
3. **Cắt đuôi log chỉ ở lúc đóng phiên** — cắt file đang được tail thì offset
   người đọc trỏ vào giữa dòng khác.
4. **stderr tách file riêng** — `run.jsonl` là JSONL mà web `JSON.parse` từng
   dòng; một warning của node chen vào là một dòng hỏng.

**Kết thúc phiên:** `result` **không** phải tín hiệu kết thúc — ở chế độ
stream-json hai chiều, mỗi lượt trả lời sinh một `result` rồi CLI chờ input
tiếp (phiên là hội thoại nhiều lượt). Phiên kết thúc khi: người bấm **Dừng**
(`systemctl --user stop` → trap ghi `stopped`), claude tự thoát (`done`/`failed`
theo mã thoát), hoặc chạm trần `RuntimeMaxSec` của unit. Đóng fd FIFO là cách
runner kết thúc *một pha* sạch sẽ (claude nhận EOF, thoát không mất state) —
dùng khi chuyển chế độ phỏng vấn→làm.

**Câu gõ chen phải được app tự ghi sổ** *(phát hiện rig S0.1 — xem
[`apps/runner/rig/FINDINGS.md`](../../apps/runner/rig/FINDINGS.md))*: CLI
**không echo** message đưa vào stdin ra stream đầu ra, nên nếu chỉ tail
`run.jsonl` thì mở lại trang sẽ mất sạch những câu đã gõ. Server action `say`
append một dòng `{"type":"bee_user_say","text":…,"ts":…}` vào `run.jsonl`
(O_APPEND, dòng ngắn — append nguyên tử) ngay khi ghi FIFO. Đây là ngoại lệ
duy nhất cho quy tắc "runner là người ghi run.jsonl", và nó được phép tồn tại
vì A+ cùng UID.

### 2.3 Hai chế độ trong một phiên — "ok làm đi"

| Chế độ | Cách chạy | Tool |
|---|---|---|
| **Phỏng vấn** | `claude --allowedTools ""` — cách spec-chat cũ đã chạy tốt | Không |
| **Làm** | Bấm "ok làm đi" → runner **kết thúc tiến trình phỏng vấn, chạy lại `claude --resume <session-id>` với đủ tool** trong worktree | Đủ |

Chọn restart-với-`--resume` thay vì đổi mode giữa tiến trình vì nó là đường
**đã biết chạy được** (Ask đang dùng `--resume`). Đổi mode qua
`control_request` của stream-json là đường mượt hơn — nằm ở §11, phải rig-test
trước khi đổi.

Với người dùng đây vẫn là *một* phiên: cùng session-id, cùng run.jsonl, cùng
màn hình. `session.json` ghi `phase: "interview" | "work"`.

---

## 3. `apps/runner/` — thành phần mới

```
apps/runner/
├── bin/session-run.sh      # ExecStart của bee-session@ — toàn bộ §2.2
├── bin/reaper.sh           # bee-reaper.timer
├── bin/doctor.sh           # kiểm checklist A+ (PRD §4.2) + linger + PAUSE
├── lib/                    # port từ reconciler: common, github, state
├── units/                  # bee-session@.service, bee-reaper.timer, …
└── install.sh              # idempotent; tạo PAUSE sẵn như installer cũ
```

### 3.1 `session-run.sh`

- Tham số duy nhất: `<id>` (instance của template unit). Mọi thứ khác đọc từ
  `session.json` — file do web ghi *trước khi* start. Không tham số nào đi qua
  argv của systemd ngoài id đã khớp `^[a-f0-9-]{36}$`.
- **`worktree:false` = phiên chat KHÔNG REPO** *(chốt 17/08, canvas.md §2)*:
  bỏ qua toàn bộ clone/fetch/worktree, cwd là `sessions/<id>/chat/`, `repo`
  được phép rỗng, và **luôn chạy `--allowedTools ""`** bất kể phase.
- **Phiên có worktree đòi repo ĐÃ ĐĂNG KÝ**: không có `repos.d/<slug>.env`
  → từ chối ngay với `reason:"unregistered-repo"` + lifecycle giải thích
  (rig-03 §2b). Lớp một ở web action (`listRepos`), lớp hai ở đây — đường
  "clone bất cứ gì trong session.json" không tồn tại.
- `trap` dọn: FIFO, cập nhật `meta.json`, **giữ** worktree (dọn worktree là
  việc của stop/reaper theo chính sách, không phải của trap — phiên fail còn
  cần xem xác).
- Commit trong worktree mang danh bot (`user.name`/`user.email` set lúc dựng).
- Phát sự kiện vòng đời dạng `{"type":"bee_lifecycle","msg":…,"ts":…}` vào
  `run.jsonl` — cùng file, client phân loại bằng `type`.

### 3.2 `reaper.sh` — hậu duệ rule 01

Điều kiện phát hiện: quét `/srv/bee/sessions/*/meta.json` có
`status:"running"` ∧ `systemctl --user is-active bee-session@<id>` ≠ active
→ đóng `meta.json` thành `failed`, dọn FIFO mồ côi, tăng `attempt`.
`attempt ≥ 2` → cờ `needs-human` trong meta, app hiện đỏ. **Nguồn phát hiện là
đĩa + systemd, không phải nhãn GitHub** — phiên chết trước khi kịp tạo issue
vẫn được dọn.

### 3.3 `doctor.sh`

Kiểm và in ✓/✗ từng dòng — fail thì web hiện báo đỏ (đọc kết quả từ file
`doctor.json` doctor ghi ra). Web đọc qua `BeeSource.readDoctor()` và vẽ
trên trang onboarding `/setup` (§4.6); unit oneshot `bee-doctor.service`
cho phép nút "Run doctor again" trên web chạy lại checklist qua
`systemctl --user start` — start block tới khi doctor.json tươi:

1. PAT là fine-grained, đúng danh sách repo, đúng 3 quyền (gọi
   `gh api /rate_limit` + metadata endpoints kiểm được).
2. Từng repo trong danh sách có branch protection trên `main`.
3. Không có secret lạ: quét `~/.ssh/`, `~/.aws/`, v.v. — có là ✗.
4. `linger` bật, các timer active, PAUSE tồn tại hay không (nói rõ).
5. Bare clone + worktree root đúng quyền.

### 3.4 Git flow trong phiên

- Bare clone per repo (`/srv/bee/repos/<slug>.git`) — giữ mẫu cũ, fetch lúc mở
  phiên. Worktree từ bare clone, branch `bee/<slug>-<n>`.
- Agent **tự** push/`gh pr create` bằng skill (§5) — không có bước "worker
  push hộ lúc kết thúc" nữa. Phiên xong mà chưa push = chưa push, app hiện
  trạng thái đó thật thà.
- Hàng rào phía GitHub (PRD §4.2): PAT hẹp + branch protection `main`. Đó là
  hai hàng rào **thật**; quy ước branch là kỷ luật, không phải hàng rào.

---

## 4. `apps/web/` — thay đổi

### 4.1 Slice mới `features/sessions/`

```
features/sessions/
├── api/start.ts · say.ts · stop.ts    # server actions — systemctl --user + ghi file
├── components/
│   ├── session-list.tsx     # n phiên nhóm theo repo: đang chạy / xong / chết / needs-human
│   ├── live-view.tsx        # dòng sự kiện + ô gõ + nút Dừng (port từ thiết kế run-live cũ)
│   ├── event-stream.tsx     # render theo type; bee_lifecycle có kiểu riêng
│   └── session-status-bar.tsx
├── hooks/use-session-stream.ts        # EventSource + nối lại theo Last-Event-ID
├── lib/parse-events.ts                # stream-json thô → sự kiện; THUẦN, không I/O
└── index.ts
```

`parse-events.ts` nhận `unknown`, thu hẹp dần, **khoan dung với dòng không
phải JSON** (đếm + bỏ qua, hiện thành sự kiện debug) — lưới an toàn dù stderr
đã tách.

### 4.2 Route SSE `app/api/session/[id]/stream/route.ts`

Giữ nguyên thiết kế v1-live §4.2, đổi đường dẫn:

- `import "server-only"`, tự kiểm session, id qua allowlist regex, đường dẫn
  qua resolver đã test chặn traversal.
- Tail theo offset byte; `id:` SSE = offset; client nối bằng `Last-Event-ID` —
  không mất khúc giữa khi mạng điện thoại rớt. Không bao giờ phát nửa dòng
  (giữ khúc đuôi chưa có `\n`, ghép lần đọc sau).
- Gắn vào phiên đã chạy lâu: N dòng cuối + sự kiện `bee_replayed` nói rõ đã bỏ
  qua bao nhiêu.
- `meta.json` hết `running` → phát nốt rồi **đóng** — không EventSource treo.
- Nhịp đọc 250ms.

### 4.3 "Ok làm đi"

Trong màn phỏng vấn, khi agent in hợp đồng → **một** nút. Bấm:
`phase: "work"` vào session.json → runner chuyển chế độ (§2.3). Hết. Tạo
issue **không còn là việc của nút này** — agent tự tạo bằng skill khi hợp đồng
chốt, mang danh bot. Bốn bước của mô hình cũ còn một.

### 4.4 Màn hình live + danh sách phiên

- Live view: như v1-live §4.4 (ô gõ luôn mở, Dừng luôn thấy, mobile-first, rớt
  mạng báo dải chứ không xoá) — cộng: đầu ra agent render **plain text** (PRD
  §4.1, nội dung untrusted).
- **Dòng sự kiện kiểu panel Claude Code trong VSCode** *(bổ sung 17/08, đã
  build)*: mỗi tool call là **một thẻ** ghép cặp `tool_use.id` ↔
  `tool_result.tool_use_id` (`lib/ghep-the.ts`, thuần, test bằng fixture
  thật) — trạng thái ● đang chạy → ✓/✗, kết quả gập trong thẻ, **thẻ lỗi tự
  mở**; thẻ đứng ở vị trí tool *bắt đầu* trong dòng thời gian. Bash hiện
  lệnh, Edit/Write/Read hiện file path. Thinking (`thinking_delta` + khối
  trọn vẹn) gập mặc định, buffer riêng không lẫn với chữ trả lời. Kết quả
  mồ côi (tool_use nằm trong khúc `bee_replayed` đã cắt) vẫn hiện thành thẻ
  — mất kết quả tệ hơn mất tiêu đề. `result.num_turns` hiện ở dòng
  turn-finished.
- **Dark mặc định + ngôn ngữ hình ảnh VSCode** *(17/08, PRD §5)*: Edit/Write
  vẽ **khối diff đỏ/xanh** từ `old_string`/`new_string`/`content` (parse giữ
  lại có trần 2000 ký tự, đếm `+n −m` ở summary); Bash vẽ khối **IN/OUT**;
  message của người là hộp viền full-width chứ không phải bubble lệch; ô nhập
  bo tròn, nút gửi ↑ #C15F3C.
- Session list là **màn hình gốc mới** của app: nhóm theo repo, mỗi phiên một
  dòng — trạng thái, branch, PR (nếu có), tuổi, usage. `needs-human` nổi đỏ
  lên đầu.

### 4.5 Auth — FR-6.5

GitHub OAuth (allowlist login) + Cloudflare Access ở rìa. Route nào cũng tự
kiểm — giữ nguyên kỷ luật cũ. Ngoài allowlist: đăng nhập được, thấy trang
trống nói thẳng "bạn không có quyền", không lộ dữ liệu.

### 4.6 Màn onboarding `/setup` (thêm 18/08)

Người mới cài máy làm theo MỘT trang, kiểm chứng ngay trên web:

1. Năm bước người-làm theo đúng thứ tự install.sh, mỗi bước một khối lệnh
   copy-paste (install runner → login claude/gh → đăng ký repo + branch
   protection → doctor → gỡ PAUSE).
2. Checklist doctor SỐNG từ `doctor.json` (`readDoctor()`): từng mục ✓/✗ kèm
   cách sửa, banner PAUSE, nút "Run doctor again" (unit `bee-doctor.service`
   oneshot — doctor exit 1 vẫn tính là chạy thành công, kết quả đỏ nằm trong
   file). Chưa từng chạy doctor → nói thẳng "chưa chạy", chỉ về bước 1 —
   không giả xanh.
3. Danh sách repo đã đăng ký — cùng nguồn `listRepos()` với form phiên.
4. Bước cuối nhúng chính `NewSessionForm`: test kết thúc ở chỗ sử dụng
   bắt đầu.

---

## 5. Skills — agent tự làm việc GitHub

Đặt ở `~/.claude/skills/` của user `bee` (không nằm trong repo đích — không
theo worktree, không bị agent của phiên khác sửa):

| Skill | Làm gì | Ghi chú |
|---|---|---|
| `bee-create-issue` | `gh issue create` trên repo của phiên | Gọi khi hợp đồng phỏng vấn chốt |
| `bee-push-pr` | push branch của phiên + `gh pr create --draft` | Từ chối nếu branch hiện tại ≠ `bee/*` |
| `bee-update-pr` | push tiếp + comment tóm tắt thay đổi | |

Skill là hướng dẫn + script mỏng gọi `gh` trực tiếp — **không broker**. Hàng
rào là PAT hẹp + branch protection, không phải code trong skill.

---

## 6. Bố cục đĩa

```
/srv/bee/                          user bee sở hữu toàn bộ
├── repos/<slug>.git               bare clone
├── work/<id>/                     worktree — một phiên một cái
├── sessions/<id>/
│   ├── session.json               web ghi trước khi start; phase đổi ở đây
│   ├── run.jsonl                  đường ra — runner ghi, web tail
│   ├── stderr.log
│   ├── meta.json                  status: running|done|stopped|failed · attempt · needs_human
│   └── usage.json                 ghi lúc đóng
├── doctor.json                    kết quả doctor gần nhất
└── PAUSE                          tồn tại = không mở phiên mới

$XDG_RUNTIME_DIR/bee/<id>.in       FIFO — mất khi reboot là đúng ý
```

Một định danh duy nhất: `<id>` = UUID v4 do web sinh, dùng cho unit, thư mục,
FIFO, `--session-id`, route. Task/issue/PR là *thuộc tính trong meta*, không
phải khoá.

---

## 7. Lệnh

```bash
cd apps/web
pnpm dev / lint / typecheck / test / test:e2e / build    # bốn cổng như cũ

cd apps/runner
bash -n bin/*.sh lib/*.sh          # sàn
./bin/doctor.sh                    # kiểm checklist A+
systemctl --user status 'bee-*'    # nhìn cả họ unit
```

---

## 8. Kiểm thử

| Tầng | Công cụ | Phủ |
|---|---|---|
| Thuần | Vitest | `parse-events` với stream-json thật + dòng rác · tail giữ nửa dòng |
| Component | Vitest + TL | live view: chạy / xong / mất kết nối / needs-human · session list |
| Route | Vitest + MSW | SSE nối lại `Last-Event-ID` · từ chối không session · từ chối traversal |
| E2E | Playwright | phỏng vấn → ok làm đi → chữ chạy → gõ chen → dừng (run.jsonl giả ghi dần) |
| Rig bash | thủ công trên máy thật | bảng dưới |

**Rig bắt buộc — toàn bộ là loại hỏng-im-lặng:**

1. `kill -9` tiến trình claude giữa chừng → reaper đóng sổ trong một tick,
   UI báo đã dừng, không spinner.
2. Đóng FIFO khi thấy `result` → claude thoát sạch, `meta.json` = `done`.
3. Gõ chen lúc agent đang giữa một tool call → CLI xếp hàng hay bỏ? (§11)
4. Phỏng vấn → `--resume` với tool → phiên nhớ đủ ngữ cảnh phỏng vấn.
5. `say` với id chứa `../` → bị từ chối ở route (một phía là đủ — không còn
   ranh giới thứ hai, nhưng phía đó phải có test).
6. Reboot máy giữa phiên → reaper dọn, session list nói thật, mở lại resume được.

---

## 9. Ranh giới

**Luôn luôn:** hành động của người mang token người bấm · route tự kiểm
session · giá trị từ trình duyệt qua allowlist regex trước khi thành tên
unit/đường dẫn · trạng thái chờ nói đang chờ gì.

**Hỏi trước:** thêm dependency runtime web · đổi `--max-turns`/timeout · thêm
skill mới có quyền ghi GitHub · đổi checklist doctor.

**Không bao giờ:** commit secret vào repo · PAT full-account · tắt branch
protection để "tiện" · render markdown từ đầu ra agent ở V1 · `if (isFixture)`
ở tầng UI.

---

## 10. Nghiệm thu V1

- [ ] Mở phiên từ điện thoại ngoài mạng nhà → sự kiện đầu < 5s
- [ ] Phỏng vấn không tool → "ok làm đi" → cùng phiên có tool, sửa code thật
- [ ] Agent tự tạo issue + draft PR bằng skill, thấy link trong dòng sự kiện
- [ ] Push thẳng `main` bị GitHub từ chối (thử tay một lần để chứng minh)
- [ ] Gõ chen → agent tiếp thu; Dừng → < 5s, không FIFO mồ côi
- [ ] Đóng trình duyệt 10 phút → xem tiếp, có `bee_replayed`
- [ ] `systemctl restart bee-web` → phiên không hề hấn
- [ ] `kill -9` → reaper đóng sổ một tick, `meta.json` không kẹt `running`
- [ ] 2 phiên song song trên cùng repo, không giẫm nhau
- [ ] `doctor.sh` xanh toàn bộ checklist A+ trên máy thật
- [ ] Ngoài allowlist: đăng nhập được, không thấy gì
- [ ] `pnpm lint typecheck test build` xanh cả bốn

---

## 11. Việc chưa quyết

| | Ghi chú |
|---|---|
| ~~Gõ chen lúc agent giữa tool call~~ | **ĐÃ GỠ (rig S0.1, 17/08):** CLI xếp hàng và tiếp thu sau khi tool xong — ô gõ được hứa "agent sẽ đọc". Kèm phát hiện: input không được echo → sinh yêu cầu `bee_user_say` ở §2.2 |
| ~~Phỏng vấn → resume với tool có nhớ ngữ cảnh?~~ | **ĐÃ GỠ (rig S0.2, 17/08):** nhớ đủ — chỉ nói "ok làm đi" là thực hiện đúng hợp đồng. Một-phiên-hai-chế-độ đứng vững |
| Chuyển chế độ bằng `control_request` thay vì restart+resume | Mượt hơn nhưng chưa kiểm chứng; V1 đi đường resume (đã chứng minh), rig thử đường này sau |
| Trần `--max-turns` phiên tương tác | 80 là trần phiên tự hành; gõ chen làm phiên dài hơn hẳn. Chốt số + báo khi còn 10 lượt |
| Số phiên song song tối đa | `bee.slice`-tương-đương cho user units; đề xuất trần 3, đọc từ config |
| `run.jsonl` phình lúc đang chạy | Trần theo byte lúc ghi (phiên 3 tiếng không được ăn hết đĩa) |
