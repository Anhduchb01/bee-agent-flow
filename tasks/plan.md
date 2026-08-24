# Plan — V3, cập nhật 24/08/2026

**Nguồn:** [PRD 3.2](../docs/PRD_bee-agent-flow.md) (Epic 5 + FR-3.3/3.4) ·
[spec session-first](../docs/specs/session-first.md) ·
[architecture.html](../docs/architecture.html) · checklist: [todo.md](todo.md) ·
deploy: [docs/deploy.md](../docs/deploy.md)

---

## 1. Đang có gì (đo thật trên máy, 24/08)

**Đã đóng:** V1 (runner systemd một-UID, chat VSCode, canvas, /setup, Tailscale
+ OAuth) · V2 (duyệt trong app, modes, approvals, Continue) · V2.7 (ô chat: chip
chọn-prefix, Enter điện thoại, đính kèm, panel actions, model theo phiên, đường
may compact) · V2.8 (bảng dự án `/projects`) · V2.9 (dialog tạo project + env,
xoá mô hình `status.json`, `deploy.sh`).

**Nền cho V3 đã có sẵn — không phải xây từ đầu:**

| Thứ | Ở đâu | Dùng cho |
|---|---|---|
| `state/claude-usage.json` — % hạn mức **cả tài khoản** (5h + 7 ngày) | `machine-ctl.ts` (refresh **bằng tay**) | FR-3.3 phanh |
| `state/claude-rate-limit.json` + `usage.json`/phiên | harvest từ run.jsonl | FR-3.4 trần chi |
| Timer nền + `heartbeat.json` + PAUSE | `reaper.sh`, units | vòng lặp hàng đợi |
| Bảng issue × phiên | `features/board` | FR-5.2 nhặt issue |
| Vòng đời phiên trọn vẹn (mở/dừng/resume/mode/model) | `session-ctl.ts` | hàng đợi gọi lại |

**Ba con số đo được hôm nay — chúng quyết định thứ tự làm:**

```
work/      3.0 GB / 6 worktree   ← 6/6 thuộc phiên ĐÃ KẾT THÚC (stopped|failed)
sessions/   25 MB / 11 phiên     ← run.jsonl lớn nhất 1.5 MB
đĩa trống  189 GB
```

**Đọc ra:** 100% dung lượng đang chiếm là rác. Một đêm 10 phiên trên repo có
`node_modules` ≈ +5GB. Trần `run.jsonl` (nợ spec §11) nhỏ hơn **100 lần** so
với worktree — nên nó xuống cuối hàng, còn dọn worktree lên đầu.

---

## 2. Quyết định kiến trúc phải chốt TRƯỚC khi code

### D1 · Máy này không phải máy chuyên dụng — cò súng #4 đã nổ

`doctor` đỏ mục `may-sach`: có `~/.ssh/id_*` (3 khoá) và `~/.kube` trên máy.
PRD §0.2 ghi rõ *"máy bắt đầu chứa secret khác"* là điều kiện **buộc** quay về
mô hình C. Hôm nay chưa đau vì mọi phiên đều có người ngồi cạnh; **V3 chính là
lúc bỏ người ngồi cạnh** — máy tự mở phiên lúc 2 giờ sáng. Ba đường:

| | Việc phải làm | Cái giá |
|---|---|---|
| **(a) Chấp nhận có ý thức** | Ghi vào PRD §0.1 rằng cò súng #4 đã nổ và vẫn chạy A+ | Supply chain npm chiếm agent = mất luôn SSH key sang máy khác |
| **(b) Tách máy** *(khuyến nghị)* | bee chạy trong VM/LXC riêng, không SSH key, không kube | Một buổi dựng; deploy.sh đã tham số hoá sẵn `BEE_PREFIX`/`BEE_ROOT` |
| **(c) Quay về mô hình C** | Nhánh `feat/bee-m3-and-web-spec` | Thuế năng lực PRD §0.1 đã bác |

**CHỐT 24/08: (a) chấp nhận có ý thức** — chưa chuyển C, chưa tách máy. Đã ghi
vào PRD §0.2 và [docs/mo-hinh-c.md](../docs/mo-hinh-c.md) (mô hình C là gì, quay
về thế nào, và những cách siết rẻ hơn nếu đổi ý). `doctor` giữ nguyên mục đỏ
`may-sach` — tắt nó là bước đầu của "A+ trôi thành A cẩu thả".

Phase 3 vì thế **mở khoá**, nhưng rủi ro của nó nay là rủi ro đã ký tên.

**Hướng gỡ đã chọn (24/08, chưa làm):** tách bee sang **user Linux riêng** thay
vì VM — rẻ hơn nhiều, yếu hơn VM một bậc, và đủ để `/home/ducba` mode 700 chặn
được đường tới khoá SSH. Docker chạy **rootless** (cho bee vào group `docker`
là xoá sạch thành quả — group đó tương đương root). Quy trình:
[tach-user.md](../docs/tach-user.md) · [docker-cho-bee.md](../docs/docker-cho-bee.md).
Làm xong thì `doctor` mục `may-sach` xanh **thành thật** và cò súng #4 tháo ngòi.

### D2 · Ai sở hữu vòng lặp hàng đợi

| | Cách | Đánh đổi |
|---|---|---|
| (a) | `queue.sh` + `bee-queue.timer`, bash tự mở phiên | Phải chép lại logic `moPhien` (session.json, slug, num, mode, model, auto-title) sang bash → **đúng loại trôi hai bản** mà repo này ghét |
| **(b) khuyến nghị** | Timer gọi `curl` vào endpoint `/api/queue/tick` của web (bearer token trong `web.env`, chỉ nghe localhost) | Một bản duy nhất của "mở phiên" (TS). Phụ thuộc web sống — nhưng web là unit có `Restart=on-failure`, cùng độ bền với timer |

Chốt (b): hàng đợi là **chính sách**, web đã sở hữu chính sách; timer chỉ là
cái đồng hồ. Tick cũng là chỗ refresh hạn mức trước khi quyết mở phiên — một
vòng, không phải hai.

### D4 · Hàng đợi là một LANE, không phải một khối riêng *(chốt 24/08)*

Một issue đã xếp hàng vẫn bị luật lane hiện tại gọi là `backlog` — tức backlog
đang gộp "chưa ai đụng" với "đã giao cho máy, chờ tới lượt". Tách thành lane
thứ năm **`Autopilot`**, đứng giữa Backlog và In session; thứ tự dọc trong lane
= thứ tự chạy. Membership đọc từ `queue.json` — vẫn là sự thật trên đĩa như mọi
lane khác, chỉ khác chủ sở hữu (bee thay vì GitHub).

- **Tên:** KHÔNG dùng "Auto" — trùng tên mode quyền ⚡ Auto ngay cạnh ô chat.
- **Kéo thả:** chỉ `Backlog ↔ Autopilot`. Ba lane còn lại là hệ quả của sự thật;
  thả thẻ vào "In session" không làm phiên chạy, thả vào "Done" không đóng issue
  trên GitHub — cho kéo vào đó là dạy người dùng một lời nói dối. Thả sai thì
  thẻ bật lại kèm lý do.
- **Cài đặt:** HTML5 drag-and-drop gốc cho desktop (repo chỉ có `@xyflow/react`
  cho canvas, không thêm dependency); điện thoại dùng nút `+` và `↑↓` — kéo thả
  trong trang đang cuộn trên iPhone là khổ hình.

### D5 · Hàng đợi luôn sống · chỉ issue · xong vẫn ở lại *(chốt 24/08)*

- **Luôn sống**, không phải khung giờ "tối nay": lane là *trạng thái*, nút ⏸
  dừng nhặt việc. Lane luôn hiện điều kiện mở phiên (không PAUSE · quota dưới
  ngưỡng · còn slot) và quota còn bao nhiêu.
- **Chỉ issue**: mỗi mục bắt buộc `repo + issue number`, không có prompt tự do —
  giữ đường nối về AC. Bù lại mỗi mục mang sẵn mode + model (mặc định ⚡ Auto +
  Default), sửa tại chỗ vì lúc nó chạy thì người đang ngủ.
- **Xong vẫn ở lại**: issue trôi sang In review/Done theo sự thật, bản ghi lần
  chạy ở lại. Canvas: phần đã chạy vốn đã hiện (node phiên + artifact,
  `build-graph.ts`); **thiếu** node cho issue đã xếp mà chưa chạy → thêm node mờ
  "chờ tự chạy", đánh dấu rõ là chưa thật.

### D3 · Chính sách dọn worktree

Xoá worktree khi **cả ba** đúng: phiên đã kết thúc · không `needs_human` ·
quá `GC_AGE_H` giờ (mặc định 24). Branch `bee/*` đã merged **hoặc đã push hết**
thì xoá worktree; còn commit chưa push thì **giữ** — code chưa rời máy mà xoá là
mất việc. Phiên `running` không bao giờ bị đụng. Ghi `gc.json` để doctor và UI đọc.

**Evidence không bị ảnh hưởng** (kiểm 24/08): nó có hai nhà, cả hai ngoài
`work/` — `sessions/<id>/evidence/` (bản bee giữ, trang duyệt đọc qua
`/api/evidence/session/<id>/…`) và `.bee/evidence/<branch>/` đã commit vào nhánh
(đi theo PR lên GitHub). gc **chỉ** đụng `work/<id>`.

**Lịch sử hội thoại cũng không mất:** Claude lưu theo đường dẫn cwd
(`~/.claude/projects/-…-work-<id>/`), mà bee luôn dùng `work/<id>` cố định — dựng
lại worktree đúng đường dẫn cũ thì `--resume <id>` vẫn nối đúng phiên.

> **⚠ Bug chặn gc — phải sửa TRƯỚC T1.** `session-run.sh` dựng worktree bằng
> `git worktree add -B "$BRANCH" "$WT" "$DEF"`; cờ `-B` là **force reset nhánh về
> main**. Thí nghiệm git 24/08: commit `f0c93ec` trên `bee/x` → xoá worktree →
> dựng lại bằng đúng lệnh đó → `bee/x` thành `141d482` (= main), commit bay mất.
> Nghĩa là hôm nay **bất kỳ** ai xoá worktree (gc, hay tay) đều làm resume thổi
> bay commit chưa push. Sửa: nhánh chưa có thì tạo, đã có thì checkout.

---

## 3. Đồ thị phụ thuộc

```
D1 (posture)            D2 (queue owner)
   │                        │
   ▼                        │
Phase 1 · Dọn đĩa           │        ← độc lập, làm ngay
   T0 sửa bug -B  ⚠        │
   T1 gc.sh + timer         │
   T2 doctor check          │
   T3 UI dung lượng         │
   │                        │
   ▼                        ▼
Phase 2 · Hạn mức tươi + phanh (FR-3.3, FR-3.4)
   T4 usage tự refresh ──► T5 phanh mở phiên ──► T6 trần chi/phiên
                                   │
                                   ▼
Phase 3 · Hàng đợi (FR-5.1) ──► T7 store ──► T8 tick ──► T9 lane Autopilot ──► T9b canvas
                                                              │
                                                              ▼
Phase 4 · Bản tin sáng (FR-5.3)  T10 tổng hợp ──► T11 lối vào
                                                              │
Phase 5 · Nợ nhỏ  T12 trần run.jsonl · T13 việc tay ◄──────────┘
```

---

## 4. Nhiệm vụ

### Phase 1 · Vận hành bền (làm trước — thu hồi 3GB ngay hôm nay)

#### T0 · Sửa `-B`: dựng lại worktree không được reset nhánh ⚠ — ✅ XONG 24/08
**Mô tả:** `git worktree add -B` force-reset nhánh về main. Đổi thành: nhánh
chưa tồn tại → tạo từ `$DEF`; đã tồn tại → checkout đúng chỗ nó đang đứng.

**Acceptance criteria**
- [ ] Phiên mới: hành vi y như cũ (nhánh mới từ nhánh mặc định)
- [ ] Xoá worktree rồi resume: commit cũ **còn nguyên**, `--resume` vẫn nối hội thoại
- [ ] Nhánh đang được worktree khác giữ → từ chối tử tế, không phá

**Verification**
- [ ] Rig git offline (bare repo tạm): commit → xoá worktree → dựng lại → `rev-parse` không đổi
- [ ] Trên máy thật: resume một phiên `stopped` còn worktree → không đổi gì

**Dependencies:** không — **chặn T1** · **Files:** `apps/runner/bin/session-run.sh`,
`apps/runner/lib/common.sh`, `apps/runner/rig/rig-06-worktree.sh` · **Scope:** S

> **Xong 24/08** (`rig-06` đỏ 4/5 → xanh 5/5). Kèm một dữ kiện cho T1: bare
> clone chỉ fetch nhánh mặc định, nên **không có ref `origin/bee/*` cục bộ** —
> luật "chỉ xoá worktree khi đã push hết" phải hỏi `git ls-remote`, không so
> được bằng ref trên máy.

#### T1 · `gc.sh` + `bee-gc.timer` — dọn worktree của phiên đã xong — ✅ CODE XONG 24/08
**Mô tả:** Timer quét `sessions/*/meta.json`, áp chính sách D3, xoá worktree
(`git worktree remove --force` rồi `rm -rf` phần còn lại) và branch `bee/*` đã
merged. Ghi `$BEE_ROOT/gc.json` (`ts`, `removed`, `freed_bytes`, `kept` kèm lý do).

**Acceptance criteria**
- [ ] Chạy trên máy thật thu hồi ≥ 2.9GB (6 worktree hiện tại đều đủ điều kiện)
- [ ] Phiên `running`/`starting` và phiên `needs_human` **không** bị đụng
- [ ] Branch `bee/*` còn commit **chưa push** được giữ, lý do nằm trong `gc.json`
- [ ] `sessions/<id>/evidence/` và `sessions/<id>/run.jsonl` **không** bị đụng
- [ ] Chạy lại lần hai là no-op (idempotent), không lỗi
- [ ] Dọn cả phần docker của phiên: `docker compose -p bee-<slug>-<num> down -v`
      + drop database/role/vhost/bucket ([docker-cho-bee §6](../docs/docker-cho-bee.md))
      — máy đang có 6.9GB volume / 17 cái, mồ côi tích lại là do đây

**Verification**
- [ ] `bash -n apps/runner/bin/gc.sh`
- [ ] Rig: tạo 1 phiên giả `running` + 1 `stopped` cũ → chạy gc → chỉ cái sau biến mất
- [ ] `du -sh $BEE_ROOT/work` trước/sau, dán số vào commit

> **Xong 24/08, nhưng AC "thu hồi ≥2.9GB" CHƯA đạt — và đó là hành vi đúng.**
> Trên máy thật gc giữ cả 6: 5 cái vì `ls-remote` trả *"Repository not found"*
> (gh active sai tài khoản), 1 cái vì mới dừng <24h. Luật "không chứng minh
> được code đã rời máy thì không xoá" đang làm đúng việc. Chạy
> `gh auth switch --user Anhduchb01` rồi chạy lại gc là thu hồi được.
> Hai điều rig-07 dạy thêm: (1) timer nền phải có `GIT_TERMINAL_PROMPT=0` +
> `timeout`, không thì git hỏi mật khẩu là gc treo vĩnh viễn; (2) gc phải chép
> lại **lỗi git thật** vào `gc.json` — bản đầu đoán "mất mạng?" trong khi sự
> thật là mất quyền, hai thứ dẫn tới hai cách sửa khác hẳn nhau.

**Dependencies:** T0 · **Files:** `apps/runner/bin/gc.sh`,
`apps/runner/units/bee-gc.{service,timer}`, `apps/runner/install.sh` · **Scope:** M

#### T2 · doctor thấy được đĩa — ✅ XONG 24/08
**Mô tả:** Thêm check `dia-phien`: tổng `work/` + `sessions/`, số worktree mồ côi
(có thư mục mà không có phiên), tuổi `gc.json`. Đỏ khi vượt ngưỡng (`GC_WARN_GB`,
mặc định 20) hoặc gc không chạy > 48h.

**Acceptance criteria**
- [ ] `doctor.json` có mục mới kèm số thật, `/setup` hiện nó
- [ ] gc chết im lặng → doctor đỏ (đúng bất biến #3: mỗi kiểu hỏng một cơ chế bắt)

**Verification** · [ ] `./bin/doctor.sh` trên máy thật · [ ] test parser web xanh
**Dependencies:** T1 · **Files:** `bin/doctor.sh`, `lib/bee/doctor-fs.ts`(+test) · **Scope:** S

#### T3 · UI: dung lượng + nút "Dọn ngay" — ✅ XONG 24/08
**Mô tả:** Trên `/setup`: dòng dung lượng (work/sessions, lần gc gần nhất, thu
hồi bao nhiêu) + nút gọi `bee-gc.service` (oneshot, chờ xong như nút doctor).

**Acceptance criteria**
- [ ] Bấm → chạy → số cập nhật, không cần reload tay
- [ ] Bấm khi có phiên đang chạy: vẫn an toàn, nói rõ đã giữ lại mấy cái

**Verification** · [ ] test component · [ ] e2e: nút hiện + bấm được trên fixture
**Dependencies:** T1, T2 · **Files:** `features/setup/*` (2–3 file) · **Scope:** S

> ### ✅ Checkpoint 1 — sau T1–T3
> - [ ] `deploy.sh` xanh; `du -sh work/` về mức thật
> - [ ] doctor xanh (trừ mục `may-sach` thuộc D1)
> - [ ] **Bạn duyệt:** để máy chạy 3 ngày, đĩa không phình → sang Phase 2

---

### Phase 2 · Hạn mức tươi + phanh (FR-3.3 P0, FR-3.4 P1)

#### T4 · Hạn mức tự làm mới — ✅ XONG 24/08
**Mô tả:** `bee-usage.timer` (30 phút) gọi refresh usage — dùng đúng đường đã có
trong `machine-ctl.ts` qua endpoint tick (D2b), không viết bản thứ hai.

**Acceptance criteria**
- [ ] `state/claude-usage.json` tự mới lại; `fetched_at` không quá 45 phút
- [ ] Không có token / gọi hỏng → ghi lý do, **không** ghi đè số cũ bằng rỗng

**Verification** · [ ] chờ 2 tick trên máy thật · [ ] test đường lỗi
**Dependencies:** D2 · **Files:** unit + 1 route + 1 lib · **Scope:** S

#### T5 · Phanh trước khi cạn (FR-3.3) — ✅ XONG 24/08
**Mô tả:** Ngưỡng `QUOTA_BRAKE_PCT` (mặc định 85) trong `web.env`. Vượt ngưỡng:
**không mở phiên mới** — cả từ hàng đợi lẫn từ nút New session; nút bị chặn nói
rõ lý do và lúc reset. Phiên đang chạy không bị giết.

**Acceptance criteria**
- [ ] Trên ngưỡng: mở phiên trả về lý do đọc được ("5h window 91%, reset 14:20")
- [ ] Dưới ngưỡng: không đổi gì so với hôm nay
- [ ] Lý do vào `run.jsonl` khi là hàng đợi (người ngủ vẫn đọc được sáng hôm sau)

**Verification** · [ ] unit test hàm quyết định (thuần, bảng ngưỡng) · [ ] e2e với fixture trên ngưỡng
**Dependencies:** T4 · **Files:** `lib/bee/quota-gate.ts`(+test), `session-ctl.ts`, UI 1 file · **Scope:** M

#### T6 · Trần chi cho một phiên (FR-3.4) — ✅ XONG 24/08
**Mô tả:** `SESSION_MAX_USD`/`SESSION_MAX_TURNS`: reaper (đã quét mỗi 30s) đọc
`usage.json` phiên đang chạy; vượt trần → dừng phiên, `needs_human`, lý do rõ.

**Acceptance criteria**
- [ ] Phiên vượt trần bị dừng trong ≤ 1 tick, `meta.json` nói vì sao
- [ ] Không cấu hình trần = hành vi như hôm nay (không phanh)

**Verification** · [ ] rig: phiên giả có usage.json quá trần → bị dừng
**Dependencies:** T4 · **Files:** `reaper.sh`, `lib/common.sh`, 1 test · **Scope:** S

> ### ✅ Checkpoint 2 — sau T4–T6
> - [ ] Ép hạn mức trên ngưỡng → không mở được phiên, lý do đọc được trên điện thoại
> - [ ] **Bạn duyệt:** phanh chặn đúng chỗ, không phiền lúc bình thường

---

### Phase 3 · Hàng đợi + đi ngủ (FR-5.1 P0, FR-5.2 P1) — **cần D1 xong**

#### T7 · Kho hàng đợi trên đĩa — ✅ XONG 24/08
**Mô tả:** `$BEE_ROOT/queue.json`: danh sách việc (repo slug, issue number hoặc
prompt tự do, mode, model, thứ tự, trạng thái `waiting|running|done|failed`).
Lib thuần: thêm/bỏ/đổi thứ tự/lấy việc kế tiếp. Ghi nguyên tử (tmp + rename).

**Acceptance criteria**
- [ ] Máy tắt giữa chừng không mất hàng đợi (FR-5.1 "máy tắt không mất")
- [ ] Hai người ghi cùng lúc không mất mục nào
- [ ] Lib thuần có test bảng: thứ tự, bỏ giữa, hàng đợi rỗng

**Verification** · [ ] `pnpm vitest run queue` · [ ] kill -9 giữa lúc ghi → file vẫn hợp lệ
**Dependencies:** không (làm song song Phase 2 được) · **Files:** `lib/bee/queue-fs.ts`(+test), `features/board/lib/queue.ts`(+test) · **Scope:** M

#### T8 · Tick: tự mở phiên khi tới lượt — ✅ XONG 24/08
**Mô tả:** `bee-queue.timer` → `/api/queue/tick` (D2b). Mỗi tick: refresh hạn
mức → kiểm PAUSE → kiểm phanh (T5) → còn slot (`MAX_PARALLEL`, mặc định 1) →
mở phiên cho việc kế tiếp → cập nhật `queue.json`.

**Acceptance criteria**
- [ ] Hai việc xếp lúc tối → sáng cả hai đã chạy tuần tự, không chồng nhau
- [ ] PAUSE bật hoặc quota trên ngưỡng → tick không mở gì, ghi lý do
- [ ] Phiên hỏng → việc chuyển `failed` kèm lý do, tick vẫn chạy tiếp việc sau

**Verification** · [ ] test route với fixture · [ ] nghiệm thu thật: xếp 2 việc, để qua đêm
**Dependencies:** T5, T7 · **Files:** route + unit + `queue-run.ts` · **Scope:** M

#### T9 · Lane `Autopilot` trên bảng dự án (D4) — ✅ XONG 24/08
**Mô tả:** Lane thứ năm giữa Backlog và In session, membership từ `queue.json`,
thứ tự dọc = thứ tự chạy. Kéo thả `Backlog ↔ Autopilot` bằng HTML5 DnD gốc;
điện thoại dùng `+` và `↑↓`. Bảng (table view) hiện `Autopilot · <vị trí>` và
nút `+`/`−`. Đầu lane luôn nói điều kiện mở phiên + quota còn lại.

**Acceptance criteria**
- [ ] Kéo Backlog→Autopilot xếp việc; kéo ngược lại bỏ khỏi hàng đợi
- [ ] Thả vào In session/In review/Done bị **từ chối** kèm lý do (không nói dối)
- [ ] Điện thoại không cần kéo: `+` và `↑↓`, vùng bấm ≥ 44px
- [ ] Lane hiện lý do khi hàng đợi đứng im (PAUSE / quota / hết slot)

**Verification** · [ ] test thuần cho luật "thả vào đâu là hợp lệ" · [ ] test component
· [ ] e2e: kéo 2 issue vào lane → đúng thứ tự → chuyển lane khi tick chạy
**Dependencies:** T7 · **Files:** `features/board/*` (4–5 file) · **Scope:** M

#### T9b · Node "chờ tự chạy" trên canvas (D5) — ✅ XONG 24/08
**Mô tả:** Issue đã xếp mà chưa chạy hiện chưa có node nào (`build-graph.ts` chỉ
dựng node từ phiên + artifact). Thêm node mờ, nhãn rõ là chưa thật, nối vào
repo-group; khi phiên chạy thì node phiên thật thay chỗ.

**Acceptance criteria**
- [ ] Nhìn là biết ngay đây là *dự định*, không phải việc đã xảy ra
- [ ] Chạy xong: node phiên + artifact như hôm nay, không đẻ node mồ côi

**Verification** · [ ] test `build-graph` với fixture có queue
**Dependencies:** T7, T9 · **Files:** `features/sessions/lib/build-graph.ts`(+test), 1 node component · **Scope:** S

> ### ✅ Checkpoint 3 — sau T7–T9 (nghiệm thu V3 thật)
> - [ ] Tối xếp 2 việc → **sáng dậy có 2 PR chờ duyệt**, không lần nào hỏi tay
> - [ ] Hạn mức không cháy giữa đêm (S5 của PRD)
> - [ ] **Bạn duyệt** trên điện thoại

---

### Phase 4 · Bản tin sáng (FR-5.3 P1)

#### T10 · Tổng hợp đêm qua — ✅ XONG 24/08
**Mô tả:** Từ `sessions/*/meta.json` + artifact + `queue.json`: chạy gì, xong gì,
kẹt gì **và vì sao** — câu tiếng người, không phải mã lỗi (PRD: "câu đọc được").

**Acceptance criteria**
- [ ] Mỗi việc kẹt có một câu vì-sao suy từ `reason`/`stop_reason`/lỗi phiên
- [ ] Rỗng-vì-không-xếp-việc ≠ rỗng-vì-lỗi (PRD §4.1)

**Verification** · [ ] test thuần trên fixture 3 kịch bản · [ ] đọc thật một sáng
**Dependencies:** T8 · **Files:** `features/brief/*` · **Scope:** M

#### T11 · Lối vào bản tin — ✅ XONG 24/08
**Mô tả:** Trang `/brief` + dòng tóm tắt trên Overview khi có bản tin chưa đọc.

**Acceptance criteria** · [ ] Mở app buổi sáng là thấy ngay, không phải đi tìm
**Verification** · [ ] e2e · **Dependencies:** T10 · **Scope:** S

---

### Phase 5 · Nợ nhỏ (làm khi đụng tự nhiên)

- **T14 · `.env` per-phiên + cấp dải cổng** (M) — quét dải 10 cổng trống liên
  tiếp từ 54000 lúc mở phiên, ghi vào `session.json` (resume dùng lại đúng dải),
  sinh `.env` trong worktree qua đường `env.d` đã có. Không dùng công thức tĩnh
  `54000+num`: hai repo có thể trùng `num`, và cổng có thể đã bị chiếm.
  AC: hai phiên cùng repo chạy `docker compose up` song song không đụng cổng ·
  cổng không đụng stack của con người · resume giữ nguyên dải.
  *Chặn: mọi repo dùng compose (ecvision).* Files: `session-ctl.ts`,
  `session-run.sh`, 1 lib thuần + test. Xem [docker-cho-bee §4](../docs/docker-cho-bee.md).

- **T15 · Cấp "lát dịch vụ" cho phiên** (M) — script idempotent tạo database +
  **role riêng chỉ có quyền trên database đó**, vhost RabbitMQ, bucket MinIO khi
  mở phiên; gc thu hồi. Role riêng làm ngay từ đầu: không có nó thì một phiên gõ
  nhầm `DROP DATABASE` giết luôn phiên khác — đúng loại hỏng mà chạy-đêm khuếch
  đại. *Chỉ cần khi đã tách user + rootless.* Xem [docker-cho-bee §3](../docs/docker-cho-bee.md).

- **T12 · Trần `run.jsonl` theo byte** ✅ XONG 24/08 (nợ spec §11, S) — cắt vòng khi vượt
  `RUN_MAX_MB`, ghi `bee_truncated` để UI nói thật là đã cắt.
- **T13 · Việc tay** (🧑): `sudo rm -rf ~/.local/opt/bee` (junk root-owned **vẫn
  còn**) · PAT "All repositories" → "Only select" · PAT hiện **không đọc được**
  `Anhduchb01/lifebook-assessment` (gh trả `Could not resolve to a Repository`)
  — kiểm lại tên repo/quyền, vì bảng dự án im lặng bỏ qua repo không đọc được.

---

## 5. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Máy tự chạy đêm trong khi máy có SSH key (D1) | **Cao** | Chặn Phase 3 sau D1; khuyến nghị tách VM |
| gc xoá nhầm việc chưa vào main | **Cao** | Chính sách D3: chỉ xoá branch đã merged; rig trước khi bật timer |
| Hàng đợi chạy khi web chết (D2b) | Trung bình | Web là unit `Restart=on-failure`; heartbeat đã bắt chết im lặng; tick lỡ nhịp là chậm chứ không sai |
| Hạn mức cháy giữa đêm | Trung bình | T4+T5 là điều kiện tiên quyết của T8 — thứ tự phase đã ép |
| Phiên đêm chạy sai cả tiếng không ai biết | Trung bình | T6 trần chi + `needs_human` + bản tin sáng |

---

## 6. Câu hỏi còn mở

1. ~~D1~~ **đã chốt (a)** 24/08 — xem §2.
2. **FR-5.4 "mở khoá dần theo repo"** (P1) chưa có định nghĩa vận hành: mode
   per-phiên + PAUSE + phanh đã phủ phần lớn ý đó. Đề xuất **treo** cho tới khi
   chạy đêm thật rồi mới biết còn thiếu gì — thêm một trục cấu hình nữa lúc này
   là đầu cơ.
3. **Số phiên song song ban đêm** — mặc định 1 (an toàn cho hạn mức + đĩa). Muốn
   2–3 thì nói trước, T8 đọc từ config nên chỉ là con số.
4. **Auto-compact trong `-p`** (spec §11) vẫn chưa quan sát được lần nào; đường
   may `⇅` đã có để đo. Phiên đêm dài là lúc nó lộ ra — xem lại sau Checkpoint 3.

---

## 7. Ngoài phạm vi V3 (giữ ranh)

Nút merge in-app (link GitHub là đủ, chốt 20/08) · GitHub App bot · multi-machine ·
canvas nâng cao (lưu vị trí node, terminal node) · xoá nhánh fallback hai UID (V4).
