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
theo mã thoát), hoặc reaper dừng nó vì vượt trần chi (`SESSION_MAX_USD`) hay
vượt trần nghỉ (`SESSION_IDLE_H`, mặc định 24h).

**Trần nghỉ đếm từ LẦN CUỐI, không phải lần đầu.** `RuntimeMaxSec` của unit
không làm được việc này — nó đếm wall-clock từ lúc unit active và không có
cách nào biết hai bên còn nói chuyện hay không, nên ở mức 6h nó giết phiên vì
tội **chờ người**: một câu hỏi đặt lúc nửa đêm luôn chết trước khi người tỉnh
dậy (gặp thật 01/09). Đồng hồ thật chạy từ dòng cuối trong `run.jsonl` — sổ
ghi cả hai chiều: stream của claude, câu người gõ, và `bee_approval`. Trên
unit `RuntimeMaxSec` còn lại **7d, thuần backstop** cho trường hợp chính
reaper đã chết. Phiên bị dừng vì im lặng bấm **Tiếp tục** là `--resume` nối
lại đúng hội thoại, nên đây là dừng chứ không phải mất. Đóng fd FIFO là cách
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

### 2.3 MỘT chế độ (đổi 19/08 — bỏ phỏng vấn)

Phiên repo là **chat thường có đủ tool từ câu đầu** (`--dangerously-skip-permissions`
trong worktree); phiên chat không repo **không bao giờ có tool**
(`--allowedTools ""`), bất kể session.json nói gì. Cửa phỏng vấn và nút
"OK, do it" đã gỡ — người dùng thật thấy nó là ma sát không mua được an
toàn tương xứng (ranh giới thật nằm ở worktree + bee/* + PAT hẹp + pre-push
fence, không nằm ở cái nút). `phase` trong session.json giữ lại cho tương
thích meta, không điều khiển gì nữa; đường `--resume` giữ nguyên — chạy lại
unit (restart, reboot) nối đúng phiên cũ. Issue/PR agent tạo ra hiện thành
node artifact nối vào phiên trên canvas (spec canvas §1).

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
- **Env overlay (thêm 19/08)**: secret code cần lúc chạy nhưng git không
  được mang — đặt vào `$BEE_ROOT/env.d/<slug>/` theo đúng cấu trúc repo
  (`.env`, `apps/web/.env.local`, …). Mỗi lần mở phiên, session-run chép đè
  toàn bộ vào worktree (đổi key một lần, phiên mới nào cũng nhận) VÀ ghi
  từng đường dẫn vào `info/exclude` riêng của worktree — agent đọc được
  key nhưng **không thể commit** chúng, kể cả khi .gitignore của repo sót.
  Lưu ý tin cậy: key đặt ở đây là key agent full-tool dùng được — chỉ đặt
  thứ đáng trao. Rig-03 §6 chứng minh offline bằng bare local + claude giả.
- **Model theo phiên (V2.7, 24/08)**: `session.json.model` → cờ `--model`.
  ALLOWLIST bắt buộc (§9): chỉ các alias CLI 2.1.161 nhận —
  `opus` · `opus[1m]` · `sonnet` · `sonnet[1m]` · `haiku`; `default` (hoặc
  giá trị lạ/thiếu) = **không truyền cờ nào**, để máy tự quyết. Chỉ alias,
  không nhận model id đầy đủ: alias luôn trỏ bản mới nhất, id thì mục ruỗng.
  **Bẫy đã tránh:** pattern trong `case` PHẢI có nháy — `opus[1m]` không
  nháy là một lớp ký tự glob và sẽ khớp nhầm `opus1`/`opusm`. Đổi model giữa
  chừng = web ghi `session.json` rồi restart unit; nhánh `--resume` nối đúng
  hội thoại dưới model mới (cùng đường với đổi mode).
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
- **Hạ cấp trên GitHub Free (chốt 19/08):** repo private trên plan Free
  KHÔNG bật được branch protection/ruleset, và PAT hẹp cũng không đọc được
  endpoint protection. Fence thay thế: `lib/pre-push-bee` — pre-push hook
  session-run cài vào `hooks/` của bare clone MỖI lần mở phiên (idempotent);
  mọi push từ worktree đi qua hook chung này, ref ngoài `refs/heads/bee/*`
  bị từ chối (kể cả main). Đây là gờ giảm tốc, không phải ranh giới (agent
  full-shell gỡ được) — doctor ghi rõ trạng thái hạ cấp trong check
  `repo:<slug>`. **Trigger nâng lại:** repo lên public hoặc account lên
  Pro → bật protection thật, doctor tự chuyển sang kiểm GitHub-side.
  Rig-03 §4 chứng minh hook bằng push thật vào bare local.

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

### 4.3 ~~"Ok làm đi"~~ — ĐÃ GỠ (19/08, xem §2.3)

Không còn nút chuyển pha. Điều khiển trong live view kiểu VSCode: nút tròn
là **Gửi ↑** khi có chữ mới, thành **Dừng ■** khi agent đang bận mà ô gõ
trống (gõ tiếp thì lại thành Gửi — message xếp hàng, rig S0.1); vòng tròn
**context %** tính từ modelUsage của dòng `result` (input + cache tokens
trên contextWindow); font stack theo VSCode; panel chat trên canvas kéo
được chiều rộng, nhớ qua localStorage. Issue vẫn do agent tự tạo bằng
skill, mang danh bot.

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
- **Action chips** *(20/08; đổi hành vi 23/08)*: phiên repo có hàng nút cuộn
  ngang ngay trên ô nhập — `Issue · Build · Review · PR · Demo · Preview`,
  đúng thứ tự flow. Bấm chip **CHỌN lệnh làm prefix** của tin nhắn (`/issue `)
  chứ **không gửi ngay** — gõ thêm ngữ cảnh rồi bấm gửi thì cả câu
  `/issue <chữ>` mới đi, qua đúng đường `expandCommandText` như tự gõ
  (`$ARGUMENTS`). Bấm lại chip đang chọn = bỏ chọn; bấm chip khác = đổi lệnh,
  giữ nguyên phần chữ đã gõ (`aria-pressed` cho chip đang chọn). *Lý do đổi:
  bản 20/08 gửi ngay nên không có cách nào kèm ngữ cảnh cho lệnh.* Chip chỉ
  render khi command tồn tại trong `~/.claude/commands` (nguồn:
  `apps/runner/commands/`, install.sh copy). Palette "/" không còn alias
  cứng — chỉ liệt kê command thật trên máy, và **chỉ hiện khi còn đang gõ
  token lệnh** (có dấu cách đầu tiên là đóng, không che chat). Phiên chat
  không repo: không chip, không palette.
- **Enter trên điện thoại là XUỐNG DÒNG** *(23/08)*: `(pointer: coarse)` →
  Enter chèn dòng mới, chỉ nút ↑ gửi; desktop giữ Enter-để-gửi (Shift+Enter
  xuống dòng). Bàn phím ảo iOS không có Shift+Enter tiện tay, nên gửi-nhầm
  giữa câu là lỗi thật của người dùng thật.
- **Nút `+` — đính kèm** *(23/08)*: menu mở lên, mục "Upload from computer"
  → server action lưu file vào worktree tại `.bee/uploads/<ts>-<tên>` rồi
  chèn `[attached: <path>]` vào ô nhập để agent `Read`. Tên file sanitize +
  prefix timestamp (không thoát ra khỏi thư mục uploads được), trần 20MB,
  `serverActions.bodySizeLimit: 25mb` cho phần overhead multipart. Phiên
  chat không có nút này — không worktree thì không có chỗ để file. Use-case
  gốc: **chụp ảnh bug bằng điện thoại, đính thẳng cho agent**.
- **Nút `⧉/` — panel actions** *(23/08)*: một palette "Filter actions…" kiểu
  VSCode, gõ là lọc xuyên ba nhóm: **Commands** (command trên máy +
  `/compact`, bấm = chèn prefix) · **Session** (Compact conversation — gửi
  `/compact` ngay; Stop session) · **Mode** (4 mode, ✓ ở mode hiện tại) ·
  **Model** (xem dưới). Phiên chat vẫn có panel (Model + Stop) nhưng không
  có Commands/Mode — không tool thì không có gì để xin phép.
- **Model theo phiên** *(V2.7, 24/08)*: nhóm Model trong panel như "Select a
  model" của VSCode — `Default · Opus (1M context) · Opus · Sonnet ·
  Sonnet (1M context) · Haiku`, dòng đang dùng có ✓, đổi là restart-resume
  (§3.1). Model đã chọn hiện cạnh ô nhập khi khác `Default` để nó không
  thành cài đặt ẩn. Mỗi dòng có `aria-label="Model: <tên>"` vì "Sonnet" là
  tiền tố của "Sonnet (1M context)" — text đơn thuần là nhập nhằng.
- **Ngữ cảnh: vòng % + đường may compact** *(23/08)*: `system/compact_boundary`
  (kèm `compact_metadata.trigger`/`pre_tokens`) render thành một dòng
  `⇅ Conversation compacted (auto) · was 165k tokens`. **Không có đường may
  này thì vòng context tụt từ 90% xuống 20% bị đọc là bug.** Vòng ≥ 90% hiện
  cảnh báo "almost full — auto-compact soon, or send /compact". Web **không**
  tự chế auto-compact thứ hai: CLI đã làm việc đó (probe 23/08 xác nhận
  `/compact` gửi qua stream-json được CLI xử lý, không phải model).

### 4.7 Bảng dự án `/projects` *(thêm 24/08)*

Màn quản lý dự án: **mọi issue của mọi repo đã đăng ký, kèm phiên đã làm nó**.

- **Nguồn:** GitHub giữ issue (`gh issue list -R <repo> --state all --limit
  100`, `lib/bee/issues.ts` — cùng kỷ luật với `artifact-detail`: allowlist
  regex, repo phải nằm trong `repos.d`, hỏng thì trả *dữ liệu* kèm lý do chứ
  không ném, cache 60s/repo để refresh trang không đẻ một `gh` mỗi lần). bee
  giữ thứ GitHub không thể biết: **issue nào thuộc phiên nào** — suy từ dòng
  `bee_artifact` trong `run.jsonl`. Đây là lý do tồn tại của màn này.
- **Bốn lane = vòng đời bee**, không phải todo board chung chung
  (`features/board/lib/lanes.ts`, thuần, test bằng fixture):

  | Lane | Khi nào |
  |---|---|
  | Backlog | chưa phiên nào nhặt — *hoặc* phiên đã chạy xong mà không đẻ ra PR nào |
  | In session | có phiên `running`/`starting` |
  | In review | có PR mở, không còn phiên chạy — bóng ở sân người |
  | Done | issue đã closed trên GitHub |

- **Trạng thái nằm trong URL**: `?p=<slug>` lọc dự án, `?view=kanban` đổi
  view. Không state client, không store — mỗi tổ hợp là một URL chia sẻ
  được, và đó cũng chính là link mà **hàng dự án trong sidebar** trỏ tới
  (trước 24/08 mọi dự án đều trỏ `/sessions` không lọc, nên danh sách chỉ
  để trang trí).
- **Điện thoại là hạng nhất**: "table" không phải `<table>` — một khối xếp
  dọc, từ `sm` trở lên mới thành lưới cột (bảng thật buộc cuộn ngang trên
  390px). Kanban cuộn ngang có snap, mỗi cột ~một bề ngang màn hình.
- **Tạo project ngay tại chỗ** *(24/08)*: nút "New project" trên bảng và nút
  `+` cạnh nhóm Projects ở sidebar mở **cùng một cửa sổ** — nhập `owner/name`
  → `registerRepoAction` (đúng action mà `/setup` gọi, không có bản thứ hai)
  → bước hai hỏi luôn **env.d của slug vừa suy ra**, vì repo chưa có secret
  là repo mà phiên đầu tiên chết ở `pnpm dev`. Trước đó cả hai chỗ đều là
  link sang `/setup`, tức là mất chỗ đang đứng để làm một việc mười giây.
  - *Ranh giới đã phải tôn trọng:* dialog sống trong `features/setup` (cạnh
    action nó gọi), nhưng sidebar là `"use client"` và **không được import
    barrel của setup** — barrel đó kéo theo `api/load.ts` (`server-only`) và
    build đổ. Lời giải: `layout.tsx` (server component) dựng sẵn phần tử rồi
    truyền xuống `AppSidebar` qua prop `nutTaoDuAn`; style của nút `+` vẫn ở
    trong shell (`SidebarNewProjectTrigger`). Luật `no-restricted-imports`
    của repo không cho lách bằng import sâu, và nó đúng.
- **Trang cũ `/projects` (mô hình status.json) đã XOÁ HẲN (24/08)** — cùng
  `features/task`, `/p/[slug]`, `/t/[slug]/[num]` và tầng lib mồ côi theo
  (`listRuns`/`readRun`/`listEvidence`, `runs-fs.ts`). Bản cũ được thay tại chỗ: Hộp thoại
  "Add project" của nó không còn đường vào từ UI — đăng ký repo ở `/setup`.
  `e2e/them-du-an.spec.ts` treo `describe.skip` kèm lý do; xoá hẳn feature
  `project` cũ (`/p/[slug]`, `/t/[slug]`, `loadProjects`) là quyết định
  riêng, chưa làm trong lượt này.

### 4.5 Auth — FR-6.5

GitHub OAuth (allowlist login) trong app + **Tailscale ở rìa** (đổi từ
Cloudflare Access 20/08): web chỉ bind 127.0.0.1:3210, `tailscale serve`
proxy HTTPS ra `https://ducba.tail7d9c45.ts.net` — chỉ thiết bị trong
tailnet của chủ máy chạm được, không có cổng nào mở ra internet công cộng,
TLS do Tailscale tự cấp. Lý do đổi: máy solo một người dùng thì tailnet
riêng an toàn hơn một URL public sau Access, và không phụ thuộc domain.
Route nào cũng tự kiểm — giữ nguyên kỷ luật cũ. Ngoài allowlist: đăng nhập
được, thấy trang trống nói thẳng "bạn không có quyền", không lộ dữ liệu.
GitHub OAuth app chỉ nhận MỘT callback → Homepage + callback trỏ URL
ts.net, mọi thiết bị (kể cả chính máy chạy web) đều vào bằng URL đó.

### 4.6 Màn onboarding `/setup` (thêm 18/08, tương tác hoá cùng ngày)

Người mới cài máy làm theo MỘT trang; setup và kiểm chứng **trên web**,
chỉ MỘT thứ bắt buộc ở máy:

1. **Ở máy (1 việc):** `install.sh` — bootstrap cả web nên không thể tự
   cài mình.
2. **Trên web (mọi thứ còn lại), qua `machine-ctl.ts`** — kỷ luật như
   session-ctl: allowlist regex trước mọi đường dẫn/argv, lỗi là dữ liệu:
   - Claude: **cả flow login trên web**. Status sống đọc trực tiếp
     (`readClaudeAuth()`: claude.env → "token", credentials máy →
     "interactive", không có → "none" — không cần đợi doctor). Nút
     "Get login link" → web spawn `claude setup-token` NGAY TRÊN MÁY dưới
     pseudo-TTY (`script -qec`, vì ink UI từ chối pipe trơn), bóc URL
     claude.ai/oauth từ output (đã lột ANSI) đưa thành link bấm được;
     người dùng approve trên trình duyệt rồi dán confirmation code lại →
     web bơm vào stdin của flow đang chờ → token `sk-ant-oat01-…` in ra
     được bóc và ghi `$BEE_ROOT/claude.env` (0600 đặt trên tmp TRƯỚC khi
     rename); session-run.sh source file này, export
     `CLAUDE_CODE_OAUTH_TOKEN`. Một flow một lúc (singleton, máy solo),
     bỏ dở tự kill sau 10 phút; code qua allowlist regex trước khi chạm
     stdin. Fallback giữ nguyên: dán token chạy sẵn từ laptop. API key
     `sk-ant-api…` bị từ chối 2 lớp — phiên chạy trên subscription.
     doctor nhận cả hai đường: claude.env hoặc login tương tác cũ.
   - Linger: nút → `loginctl enable-linger`.
   - PAT: form dán token → `gh auth login --with-token` (token đi qua
     **stdin**, không argv — ps/log không thấy) + `gh auth setup-git`.
     Chặn token classic ở cả client lẫn server (`validatePat`).
   - Repo: form đăng ký/gỡ → ghi `repos.d/<slug>.env` (tmp+rename, REPO_RE,
     chặn slug trùng trỏ repo khác); mỗi repo kèm verdict protection của
     doctor + deep-link `github.com/<repo>/settings/branches`.
   - PAUSE: toggle go-live/pause — nút go-live **khoá tới khi doctor xanh
     toàn bộ** và nói rõ lý do.
   - **Branch protection cố ý KHÔNG làm từ web**: cần quyền admin repo,
     mà PAT máy chỉ có contents+PR+issues (A+). Làm bằng tay GitHub-side,
     doctor kiểm.
3. Mỗi action kết thúc bằng một lượt doctor mới (`bee-doctor.service`
   oneshot — exit 1 vẫn là chạy thành công, kết quả đỏ nằm trong file) —
   trang luôn hiện sự thật đã kiểm, không hiện hy vọng. Chưa từng chạy
   doctor → nói thẳng, chỉ về bước 1 — không giả xanh.
4. Bước cuối nhúng chính `NewSessionForm`: test kết thúc ở chỗ sử dụng
   bắt đầu.
5. Login tự đổ về đây khi máy chưa verify / doctor đỏ (xem mục dưới).
5. Login tự đổ về đây: máy chưa từng chạy doctor (null) hoặc doctor đỏ →
   đích sau đăng nhập là `/setup` thay vì Overview trống (`postLoginTarget`
   thuần, có test; `?next=` nội bộ vẫn thắng, chặn `//host` open
   redirect). Máy xanh → về `/` như thường.

---

## 5. Skills — agent tự làm việc GitHub

Đặt ở `~/.claude/skills/` (nguồn: `apps/runner/skills/`, install.sh copy —
không nằm trong repo đích, không theo worktree, không bị agent của phiên
khác sửa). Viết bằng **tiếng Anh** kể cả template issue/PR (quy ước 20/08 —
chúng đổ ra GitHub):

| Skill | Làm gì | Ghi chú |
|---|---|---|
| `bee-create-issue` | `gh issue create` trên repo của phiên, **template bắt buộc**: Context / What to build / Acceptance criteria (checkbox) / Constraints / Out of scope | Chưa rõ AC thì hỏi lại, không tạo mù |
| `bee-push-pr` | push + `gh pr create --draft`, **bằng-chứng-trước**: snapshot từ lượt test XANH commit vào `.bee/evidence/`, nhúng `blob…?raw=true` vào body (template: Summary / Verification / Snapshots / Demo·Preview) | Từ chối nếu branch ≠ `bee/*`; video không commit |
| `bee-update-pr` | push tiếp + comment tóm tắt; đổi UI thì làm mới evidence | |
| `bee-demo` *(20/08)* | video demo: Playwright headless quay lượt chạy xanh → `$BEE_SESSION_DIR/evidence/`; hoặc `record-screen` quay tab Chrome thật (extension, vendored MIT) | Không ghép video nhiều lượt chạy |
| `bee-preview` *(20/08)* | server sống trong worktree dưới transient systemd unit (`systemd-run --user`), port 3400+num, `tailscale serve --https=PORT` → link bấm từ điện thoại; công thức per-repo `env.d/<slug>/.bee/preview.sh` (overlay chép vào worktree, git-excluded) — repo cần Docker tự `compose up -d` trong script, `COMPOSE_PROJECT_NAME` theo phiên | Chỉ bind 127.0.0.1; một preview mỗi repo một lúc (V1) |

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

apps/runner/bin/deploy.sh          # MỘT lệnh: cổng → build → cài runner → restart web → doctor
```

Deploy chi tiết (cờ, cách quay lui, hỏng thì nhìn đâu): [docs/deploy.md](../deploy.md).
**Bẫy đã đóng bằng script:** `session-run.sh` chạy từ bản ĐÃ CÀI ở
`$PREFIX/bin` chứ không phải từ repo — sửa runner mà chỉ restart web thì
thay đổi không bao giờ tới phiên.

---

## 8. Kiểm thử

| Tầng | Công cụ | Phủ |
|---|---|---|
| Thuần | Vitest | `parse-events` với stream-json thật + dòng rác · tail giữ nửa dòng |
| Component | Vitest + TL | live view: chạy / xong / mất kết nối / needs-human · session list |
| Route | Vitest + MSW | SSE nối lại `Last-Event-ID` · từ chối không session · từ chối traversal |
| E2E | Playwright | mở phiên → chữ chạy → gõ chen → dừng (run.jsonl giả ghi dần) · chip chọn prefix rồi gửi · panel actions đổi mode/model |
| Rig bash | thủ công trên máy thật | bảng dưới |

**Rig bắt buộc — toàn bộ là loại hỏng-im-lặng:**

1. `kill -9` tiến trình claude giữa chừng → reaper đóng sổ trong một tick,
   UI báo đã dừng, không spinner.
2. Đóng FIFO khi thấy `result` → claude thoát sạch, `meta.json` = `done`.
3. Gõ chen lúc agent đang giữa một tool call → CLI xếp hàng (đã gỡ, S0.1).
4. Đổi mode/model giữa chừng → restart + `--resume` nối đúng hội thoại cũ,
   không mất lượt nào (đường resume: S0.2; đổi mode: rig-05).
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
- [ ] Phiên repo có đủ tool từ câu đầu → sửa code thật (mode Auto)
- [ ] Đổi mode và đổi model giữa chat → cùng hội thoại, không mất lượt
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
| Auto-compact có thật sự nổ trong `-p` không? | Docs 2.1.161 nói CÓ (không có ngoại lệ cho stream-json) và binary có đủ `autoCompactEnabled`/`CLAUDE_CODE_AUTO_COMPACT_WINDOW`, nhưng ta **chưa quan sát được lần nào**. Đường may `compact_boundary` (§4.4) là dụng cụ đo: chạy thật một thời gian mà vòng lên cao vẫn không thấy `⇅` → nổ thật là không có, lúc đó set `CLAUDE_CODE_AUTO_COMPACT_WINDOW` trong session-run.sh. **Không** tự chế auto-compact phía web trước khi có bằng chứng — compact hai lần là đốt token |
| Model ngoài danh sách alias (vd Fable) | `--model` nhận cả model id đầy đủ, nhưng id mục ruỗng theo thời gian nên allowlist V2.7 chỉ có alias. Muốn Fable thì thêm một dòng ánh xạ tên → id; CLI báo lỗi model sai một cách lịch sự (đã probe), nên rủi ro thấp |
