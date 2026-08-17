# Plan triển khai — V1 Live

**Lập:** 2026-08-17 · **Thay thế:** bản plan 13/08 (chia mốc A/B/C theo mô hình cũ)
**Nguồn:** [`docs/specs/v1-live.md`](../docs/specs/v1-live.md) ·
[`docs/PRD_bee-agent-flow.md`](../docs/PRD_bee-agent-flow.md)

---

## Chuyện gì đã xảy ra với plan cũ

Plan 13/08 chia ba nhánh: **A** web trên fixture · **C** nghiệm thu reconciler ·
**B** nối vào dữ liệu thật. Nhánh A gần xong, C xong M0/M2, B mới có code.

PRD 2.0 lật mô hình sản phẩm, nên phần lớn nhánh B mất nghĩa theo cách nó được
định nghĩa: nó nối app vào một hệ thống mà **hàng đợi là nhãn GitHub**, còn bây
giờ hàng đợi rời khỏi đó. Việc đã làm ở A không mất — hộp thư, trang task, cửa
sổ phỏng vấn, xem bằng chứng, đọc `/srv/bee` đều dùng lại nguyên. Việc chưa làm
ở B thì được xếp lại theo mốc mới.

Ba việc của người còn treo từ plan cũ vẫn treo, và **hai trong ba đổi nghĩa** —
xem §6.

---

## Điều duy nhất quyết định thứ tự

Spec có một ẩn số chưa ai thử: **gõ chen lúc agent đang giữa một tool call thì
CLI xếp hàng hay bỏ?** Đáp án quyết định UI hứa gì với người dùng, và hứa sai
thì tệ hơn không hứa.

Nên nó là **task số 0**, trước mọi thứ khác. Nó rẻ (một rig, không cần máy
Ubuntu) và nó trả về hai thứ cùng lúc: câu trả lời, và **một file `run.jsonl`
thật** để mọi test phía web dùng làm fixture thay vì bịa.

---

## Đồ thị phụ thuộc

```
L0.1  rig stream-json hai chiều  ─────┬──────────────────────┐
      (ẩn số + fixture thật)          │                      │
                                      ▼                      ▼
                        ┌── L1.1 run_open/run_close      L2.1 đọc luồng (thuần)
                        │       (bash)                        │
                        │        │                            ▼
                        │        ▼                       L2.2 route SSE
                        │   L1.2 agent-exec ghi thẳng         │
                        │        │                            ▼
                        │        │                       L2.3 màn hình live
                        │        │                            │
                        └────────┴──────────┬─────────────────┘
                                            ▼
                              L3.1 bee-request.path (orch)
                              L3.3 FIFO + stream-json vào
                                            │
                                   ┌────────┴────────┐
                                   ▼                 ▼
                          L3.2 web ghi yêu cầu   L3.4 lệnh say
                                   │                 │
                                   └────────┬────────┘
                                            ▼
                                   L4.1 "ok làm đi"  ·  L4.2 Dừng
                                            │
                                            ▼
                                   L4.3 🧑 OAuth + Cloudflare
                                            │
                                            ▼
                                   L4.4 🧑 Nghiệm thu V1
```

**Nhánh bash (L1.x) và nhánh web (L2.x) chạy song song được** sau khi L0.1 xong,
vì L2.x chỉ cần *hình dạng* của `run.jsonl` — thứ L0.1 đã ghi lại thành fixture.
Chúng gặp nhau ở checkpoint B.

| Song song được | Phải tuần tự |
|---|---|
| L1.1 + L1.2 (bash) ∥ L2.1 → L2.2 → L2.3 (web) | Trong mỗi nhánh, đúng thứ tự |
| L3.1 (orch) ∥ L3.3 (agent) | L3.2 sau L3.1 · L3.4 sau L3.3 |
| — | L4.x sau toàn bộ L3.x |

---

## Cắt dọc, không cắt ngang

Mỗi task là một đường đi trọn vẹn và kiểm được, không phải một tầng. Cụ thể:
L2.2 không phải "làm hết mọi route", nó là *một* route với đủ test bảo mật của
chính nó; L3.1 không phải "làm hạ tầng systemd", nó là *một* đường yêu cầu chạy
được từ file tới unit.

Ngoại lệ có chủ ý: **L1.1 là một lát cắt ngang**. Nó đổi nơi `run.jsonl` sống,
và mọi thứ phía sau đứng trên đó. Cắt dọc nó thành "một rule dùng đường mới,
tám rule dùng đường cũ" là tạo ra hai đường song song trong một hệ thống mà cả
giá trị nằm ở chỗ chỉ có một đường.

---

## Phase 0 · Gỡ ẩn số

### L0.1 🤖 Rig `stream-json` hai chiều

**Mô tả:** Dựng một rig tối thiểu dưới `bee-agent` (hoặc user dev có login
Claude): FIFO → `claude -p --input-format stream-json --output-format
stream-json --include-partial-messages --session-id <uuid>`. Cho agent chạy một
việc dài (đọc file, `sleep`), gửi một câu chen vào giữa, ghi lại toàn bộ.

**Acceptance criteria:**
- [ ] Trả lời được: gõ chen lúc agent **đang giữa một tool call** thì CLI xếp
      hàng, bỏ, hay lỗi — kèm bằng chứng, không suy luận từ tài liệu
- [ ] Trả lời được: `--session-id` có thật sự đặt được id do ta sinh, và
      `--resume` với id đó có nối lại đúng phiên không
- [ ] Một `run.jsonl` thật được lưu làm fixture, có đủ: `partial`, tool call,
      tool result, `result` cuối, và **một dòng bị cắt đôi** (cắt tay để test)

**Verification:**
- [ ] `docs/design/live-session.md` ghi lại kết quả kèm lệnh đã chạy
- [ ] Fixture nằm ở `apps/web/src/lib/fixtures/stream/`, đọc được bằng `jq`

**Dependencies:** None · **Scope:** S (rig + 1 doc + 1 fixture)

> Nếu kết quả là “CLI bỏ tin nhắn khi đang giữa tool call”, **dừng lại và báo**:
> UI phải hứa khác đi, và có thể phải xếp hàng ở phía ta. Đó là lý do task này
> đứng đầu chứ không nằm giữa.

---

## Phase 1 · Bản ghi sống trên đĩa (bash — review riêng)

### L1.1 🤖 `run_open` / `run_close`

**Mô tả:** Tách [`run_archive`](../apps/reconciler/lib/state.sh#L174) thành
`run_open` (lúc worker nhận việc) và `run_close` (lúc worker thoát). Thư mục run
ra đời **lúc bắt đầu**, `chgrp`+`chmod g+rX` ngay, `meta.json` mang
`status:"running"` và `started_at`.

**Acceptance criteria:**
- [ ] `meta.json` tồn tại và đọc được bởi một user ngoài group `bee` **ngay khi
      phiên vừa khởi động**, không phải chờ nó kết thúc
- [ ] `run_close` cập nhật `status` thành `done`/`failed`, cắt đuôi `run.jsonl`
      nếu quá `RUN_LOG_MAX_LINES`, ghi `usage.json`
- [ ] Cắt đuôi **chỉ** xảy ra ở `run_close` — không bao giờ lúc đang ghi

**Verification:**
- [ ] Rig: chạy một rule giả, `stat` thư mục run giữa chừng, kiểm mode và nội dung
- [ ] `bash -n` sạch · `be dry-run` không ghi gì
- [ ] `apps/web/src/lib/bee/types.ts` đổi trong **cùng commit** (luật AGENTS.md §4)

**Dependencies:** None (song song được với L2.x) · **Scope:** M (4 file)
**Files:** `lib/state.sh` · `bin/worker.sh` · `src/lib/bee/types.ts` · `src/lib/bee/runs-fs.ts`

### L1.2 🤖 `agent-exec.sh` ghi thẳng vào thư mục run

**Mô tả:** Bỏ đường vòng qua `state/<id>/run.jsonl`. Agent ghi thẳng vào thư mục
bền, nên không còn cửa sổ thời gian nào mà dữ liệu chỉ tồn tại ở chỗ sắp bị xoá.

**Acceptance criteria:**
- [ ] `run.jsonl` xuất hiện trong `/srv/bee/runs/…` **trong vòng 2 giây** kể từ
      khi phiên khởi động, và dài dần ra trong lúc chạy
- [ ] `kill -9` worker giữa chừng → tick sau rule 01 dọn, `meta.json` chuyển
      khỏi `running`, **không kẹt**
- [ ] Rule 07 cũ chạy hết một vòng vẫn xanh — không hồi quy

**Verification:**
- [ ] Rig kịch bản 1 (đã có) vẫn xanh
- [ ] Rig mới: giết giữa chừng hai lần → `needs-human`

**Dependencies:** L1.1 · **Scope:** S–M (3 file)
**Files:** `bin/agent-exec.sh` · `bin/worker.sh` · `lib/state.sh`

> ### ✅ Checkpoint A — bản ghi đọc được lúc đang chạy
> - [ ] Một phiên đang chạy: `tail -f` được `run.jsonl` từ một user ngoài group `bee`
> - [ ] Không rule nào hồi quy · `be doctor` mọi mục ✓
> - [ ] **Review riêng phần bash trước khi sang phase khác**

---

## Phase 2 · Web đọc được luồng đang chảy (không cần máy Ubuntu)

### L2.1 🤖 `lib/bee/run-stream.ts` — đọc tiếp và hiểu

**Mô tả:** Hai thứ thuần, không I/O ngoài đọc file: đọc thêm từ một offset mà
không bao giờ phát nửa dòng, và biến `stream-json` thô thành sự kiện hiển thị được.

**Acceptance criteria:**
- [ ] Dòng JSON bị cắt đôi giữa hai lần đọc → ghép lại đúng, **không** phát nửa dòng
- [ ] Dòng rác không phải JSON → bỏ qua, không ném lỗi, không làm chết stream
- [ ] `partial` gộp lại thành một khối chữ liền, không nhân đôi

**Verification:**
- [ ] `pnpm test` — dùng đúng fixture của L0.1, không phải dữ liệu bịa
- [ ] `pnpm typecheck` — `any` không xuất hiện; stream vào bằng `unknown`

**Dependencies:** L0.1 · **Scope:** S (2 file + test)
**Files:** `src/lib/bee/run-stream.ts` · `src/features/run-live/lib/parse-events.ts`

### L2.2 🤖 Route SSE `/api/run/[id]/stream`

**Acceptance criteria:**
- [ ] Nối lại bằng `Last-Event-ID` → tiếp đúng chỗ, **không mất khúc giữa**
- [ ] Gắn vào phiên đã chạy lâu → gửi N dòng cuối kèm `bee_replayed` nói rõ đã
      bỏ qua bao nhiêu; **không im lặng cắt**
- [ ] `meta.json` khác `running` → phát nốt rồi **đóng**, không treo vĩnh viễn
- [ ] Không session → 401 · `id` chứa `../` → **từ chối**

**Verification:**
- [ ] `pnpm test` với MSW; ba test bảo mật là bắt buộc, không phải tuỳ chọn
- [ ] Dùng lại `resolveEvidencePath` — **không** viết hàm giải đường dẫn thứ hai

**Dependencies:** L2.1 · **Scope:** S–M (2 file + test)

### L2.3 🤖 Màn hình live

**Acceptance criteria:**
- [ ] Dòng sự kiện: chữ · tool call · kết quả tool (gập được) · lỗi
- [ ] Mất kết nối → dải báo và tự thử lại, **không xoá** những gì đã hiện
- [ ] Phiên đã xong → thanh trạng thái đổi, ô gõ đóng, hiện link PR
- [ ] Dùng được trên màn hình điện thoại thật

**Verification:**
- [ ] Playwright: chạy trên một `run.jsonl` giả được **ghi dần** trong lúc test
- [ ] `pnpm lint typecheck test build` xanh cả bốn

**Dependencies:** L2.2 · **Scope:** M (4–5 file)
**Files:** `src/features/run-live/{components,hooks,index.ts}` · `src/app/(app)/...`

> ### ✅ Checkpoint B — demo được trên fixture, chưa cần một máy Ubuntu nào
> - [ ] Mở app, thấy chữ chạy từ một file đang được ghi dần
> - [ ] Bốn cổng chất lượng xanh
> - [ ] Bạn xem và duyệt bố cục màn live trước khi nối vào máy thật

---

## Phase 3 · Đường điều khiển và đường vào

### L3.1 🤖 `bee-request.path` → `bee-request.service`

**Mô tả:** Web ghi một file yêu cầu vào thư mục của chính nó; systemd bắt
inotify; `bee-orch` kiểm rồi `systemctl start|stop`. **Web không được cấp sudo
hay polkit** — xem đính chính ở [spec §3.3](../docs/specs/v1-live.md).

**Acceptance criteria:**
- [ ] Ghi một file yêu cầu hợp lệ → unit chạy **trong dưới 1 giây**, file bị xoá
- [ ] `slug` không có trong `/etc/bee/repos.d/`, hoặc chứa `@ / .. `→ **từ chối**,
      không unit nào được start, có log nói vì sao
- [ ] File rác / JSON hỏng → bỏ qua và xoá, không làm chết `.path` unit

**Verification:**
- [ ] Rig: 6 file yêu cầu (2 hợp lệ, 4 độc) → đúng 2 unit chạy
- [ ] `sudo -u bee-web -n true` vẫn **FAIL** sau khi cài

**Dependencies:** L1.2 · **Scope:** M (3 file)
**Files:** `bin/request-run.sh` · `systemd/bee-request.path` · `systemd/bee-request.service` · `install.sh`

### L3.2 🤖 Web ghi yêu cầu

**Acceptance criteria:**
- [ ] Server action `start`/`stop` ghi file yêu cầu, trả về `session_id` đã sinh
- [ ] `StateDirectory=bee-web`, thư mục `0750`, orch đọc được, web **vẫn không**
      ghi được vào `/srv/bee/**`
- [ ] Yêu cầu cho dự án không có trên dashboard → chặn **ở phía web trước**

**Verification:** `pnpm test` · thử trên máy: bấm → unit chạy
**Dependencies:** L3.1 · **Scope:** S–M (3 file)

### L3.3 🤖 FIFO + `stream-json` đường vào

**Acceptance criteria:**
- [ ] FIFO mở read-write (`exec 3<>`) — phiên **không** thoát khi người ghi đóng
- [ ] `--session-id` do web sinh được dùng đúng
- [ ] FIFO được dọn trong `trap`, không để lại rác trong `/run/bee/sessions/`

**Verification:** rig của L0.1 chạy lại, lần này qua đúng đường thật
**Dependencies:** L1.2 · **Scope:** S (1–2 file)

### L3.4 🤖 Lệnh `say` và ô gõ

**Acceptance criteria:**
- [ ] Gõ một câu lúc agent đang chạy → xuất hiện trong dòng sự kiện, agent tiếp thu
- [ ] `id` chứa `../` → từ chối ở **cả hai** phía (web và cầu nối)
- [ ] Tin nhắn > 32 KB → từ chối, nói rõ

**Verification:** `pnpm test` + thử tay trên máy
**Dependencies:** L3.3 · **Scope:** M (4 file)
**Files:** `bin/spec-chat.mjs` · `src/app/api/run/[id]/say/route.ts` · `src/features/run-live/…`

> ### ✅ Checkpoint C — vòng live khép kín trên máy thật
> - [ ] Khởi động một phiên từ app, xem chạy, gõ chen, dừng — cả bốn việc
> - [ ] `systemctl restart bee-web` giữa chừng → phiên **không hề hấn**
> - [ ] Ba lệnh ranh giới token vẫn đúng · `be doctor` mọi mục ✓

---

## Phase 4 · Cửa duy nhất và truy cập thật

### L4.1 🤖 "Ok làm đi"

**Mô tả:** Trong đúng cửa sổ phỏng vấn đang có, khi agent đã in ra hợp đồng thì
hiện **một** nút. Bấm → sinh `session_id` → tạo issue dưới tên người bấm → ghi
yêu cầu → chuyển sang trang live. Không có bước thứ năm.

**Acceptance criteria:**
- [ ] Từ lúc bấm tới chữ đầu tiên: **< 5 giây**
- [ ] Issue trên GitHub mang **tên người bấm**, có đủ hợp đồng
- [ ] Hỏng ở bước nào thì nói ra **bước đó** — "tạo issue xong nhưng không khởi
      động được phiên" là câu khác hẳn "không tạo được issue"

**Verification:**
- [ ] Playwright: đi hết đường từ ô phỏng vấn tới màn live
- [ ] Trên máy thật: bấm và **bấm đồng hồ** — dưới 5 giây hay không
- [ ] `pnpm lint typecheck test build` xanh cả bốn

**Dependencies:** L3.2, L3.4, L2.3 · **Scope:** M (4 file)

### L4.2 🤖 Nút Dừng

**Acceptance criteria:**
- [ ] Dừng trong **< 5 giây** · worktree dọn sạch · không FIFO mồ côi
- [ ] `meta.json` ghi `stopped`, màn hình đổi trạng thái, không quay spinner

**Verification:**
- [ ] Trên máy: bấm Dừng giữa chừng, rồi `ls /run/bee/sessions/` và `ls /srv/bee/work/` — cả hai sạch

**Dependencies:** L3.2 · **Scope:** S

### L4.3 🧑 OAuth app thật + Cloudflare Access

**Acceptance criteria:**
- [ ] Đăng nhập được từ ngoài mạng nhà, trên điện thoại
- [ ] Người ngoài allowlist đăng nhập thành công nhưng **không thấy gì**

**Verification:**
- [ ] Tắt Wi-Fi nhà, mở bằng 4G trên điện thoại — đăng nhập được
- [ ] Đăng nhập bằng một tài khoản GitHub khác → thấy trống

**Dependencies:** None về code (làm song song bất cứ lúc nào) · **Scope:** người

### L4.4 🧑 Nghiệm thu V1

**Acceptance criteria:** [spec §10](../docs/specs/v1-live.md) tick hết 15 mục,
làm trên **điện thoại, ngoài mạng nhà**.

**Verification:** đi lại toàn bộ danh sách đó một lượt, không bỏ mục nào ·
**Dependencies:** L4.1, L4.2, L4.3 · **Scope:** người

> ### ✅ Checkpoint D — V1 xong
> Nói ý tưởng → "ok làm đi" → nhìn nó làm → có PR. Từ bất cứ đâu.

---

## Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Gõ chen lúc agent giữa tool call không hoạt động như giả định | **Cao** | L0.1 là task đầu tiên. Sai giả định thì đổi UI trước khi viết UI |
| `bee-request.service` là đường leo thang mới — nó chạy dưới orch, đọc file do web ghi | **Cao** | Danh sách cho phép theo regex + đối chiếu `repos.d/`; rig 6 file độc; review riêng |
| Đổi nơi `run.jsonl` sống làm hồi quy rule đang chạy được | Trung bình | L1.2 bắt buộc chạy lại rig kịch bản 1; checkpoint A chặn |
| `run.jsonl` phình lúc đang chạy, ăn hết đĩa | Trung bình | Chưa có lời giải — xem §5. Trần theo byte lúc đang ghi |
| Phiên live tranh slot với rule nền, hạn mức cạn giữa chừng | Trung bình | V1 chấp nhận; phanh hạn mức là FR-3.3, mốc V3. Nói ra khi còn 10 lượt |
| Hai mô hình cùng tồn tại (nhãn-hàng-đợi và app-khởi-động) | Trung bình | V1 **không** gỡ rule 07. Gỡ ở V4, sau khi đường mới đã chạy thật |

---

## Việc chưa quyết — cần chốt trước khi tới phase tương ứng

| Cần trước | Câu hỏi |
|---|---|
| L3.3 | `--max-turns` cho phiên live là bao nhiêu, và cảnh báo khi còn mấy lượt |
| L3.1 | Phiên live tranh slot `build` với rule 07, hay có bể riêng |
| L1.2 | Trần theo byte cho `run.jsonl` lúc đang ghi (`RUN_LOG_MAX_LINES` chỉ áp lúc đóng) |
| L3.3 | Group của FIFO — group của cầu nối hay `bee`? Installer là chỗ quyết |

---

## Định nghĩa "xong" — áp cho mọi task

Ngoài acceptance criteria riêng, mỗi task phải:

- `pnpm lint typecheck test build` xanh cả bốn (task chạm `apps/web/`)
- `bash -n` sạch và có rig chạy được (task chạm `apps/reconciler/`)
- Không `if (isFixture)` ở tầng UI
- Không component/hook nào biết mình đang chạy trên fixture hay dữ liệu thật
- Comment giải thích **vì sao**, không phải **cái gì**
