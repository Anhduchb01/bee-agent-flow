# SPEC — V1 Live

> ⚠️ **Đóng băng (17/08/2026).** Spec này viết cho PRD 2.0 (mô hình hai UID).
> PRD 3.0 chuyển sang mô hình session-first một UID — spec đang hiệu lực là
> [`session-first.md`](session-first.md). Phần còn giá trị và đã được chuyển
> nguyên sang spec mới: **§3.2** (FIFO read-write, stream-json hai chiều) và
> **§4.2** (SSE tail theo offset). Giữ nguyên văn làm tham chiếu fallback.

Đặc tả kỹ thuật cho mốc **V1 — Live** của [`docs/PRD_bee-agent-flow.md`](../PRD_bee-agent-flow.md):
FR-1.2 · FR-1.3 · FR-1.4 · FR-1.5 · FR-5.2 · FR-6.2.

**Đầu vào đã chốt:** PRD 2.0 · bốn quyết định trong §0 · [`AGENTS.md`](../../AGENTS.md)
**Trạng thái:** bản nháp đầu, **chờ duyệt**. Chưa viết dòng code nào.
**Đây là spec liên-thành-phần** — nó sửa cả `apps/web/` lẫn `apps/reconciler/`,
trái với luật thường lệ. Phần bash ở §3 phải review tách riêng khỏi phần web ở §4.

---

## 0. Bốn quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Phiên live sống ở đâu | **"Như Claude Code trong VSCode"** — xem §2, phương án lai: `bee-task@` giữ vòng đời, `stream-json` hai chiều giữ tính tương tác |
| "Ok làm đi" có tạo issue không | **Có.** Tạo issue trước rồi mới chạy. Nhãn vẫn gắn để đọc, **không** còn là hàng đợi |
| Can thiệp lúc đang chạy | **Xem + Dừng + Nói chen giữa chừng** |
| OAuth + rìa mạng thật | **Có, nằm trong V1.** Không có nó thì "giao việc từ điện thoại" không tồn tại. Rìa chốt là **Tailscale** (20/08) — tailnet riêng thay cho Cloudflare Access |

**Không nằm trong V1:** hàng đợi do app sở hữu · chế độ đi ngủ · ngân sách hạn
mức · nút merge · bản tin buổi sáng. Xem PRD §7.1.

---

## 1. Mục tiêu

Bạn nói ý tưởng → agent phỏng vấn → bạn nói **"ok làm đi"** → **chữ bắt đầu chạy
trong dưới 5 giây** → bạn nhìn agent đọc file, sửa code, chạy test → gõ chen một
câu thì nó tiếp thu → thấy sai thì bấm dừng → xong thì có PR.

Làm được **từ điện thoại, ngoài mạng nhà.**

**Đo bằng ba câu, cả ba kiểm được:**

1. Từ lúc bấm tới chữ đầu tiên: **< 5 giây**.
2. Đóng trình duyệt, mở lại sau 10 phút: phiên **vẫn đang chạy**, xem tiếp được
   từ chỗ nó đang tới, không mất khúc giữa.
3. `systemctl restart bee-web` giữa lúc agent đang làm: phiên **không hề hấn gì**.

Câu 2 và 3 là lý do phương án "daemon giữ phiên trong RAM" bị loại.

---

## 2. Kiến trúc — đường đi của một phiên

### 2.1 Vì sao phương án lai

"Như Claude Code trong VSCode" đòi hai thứ mà thoạt nhìn kéo ngược nhau:
**tương tác hai chiều** (nói chen được) và **bền** (đóng máy không mất).

| | Chỉ tail file | Chỉ daemon giữ RAM | **Lai (chốt)** |
|---|---|---|---|
| Nói chen giữa chừng | ✗ | ✓ | ✓ |
| Sống sót đóng trình duyệt | ✓ | ✗ | ✓ |
| Sống sót restart web app | ✓ | ✗ | ✓ |
| Dùng lại khoá unit, slot, rule 01 dọn | ✓ | ✗ | ✓ |
| Code mới phải viết | ít | nhiều | **ít** |

Phương án lai tách **đường ra** khỏi **đường vào**:

- **Đường ra bền, một chiều:** agent ghi `run.jsonl` xuống đĩa; web đọc file đó.
  Không ai giữ trạng thái trong bộ nhớ, nên không ai làm mất nó.
- **Đường vào tương tác:** một FIFO nối vào stdin của tiến trình `claude` đang
  chạy, nhờ `--input-format stream-json`.

Cả hai đều là thứ CLI đã hỗ trợ sẵn (`claude 2.1.161`), không phải thứ ta chế ra.

### 2.2 Sơ đồ

```
Trình duyệt (điện thoại/laptop)
   │
   │ ① POST /api/run/start        ② GET /api/run/<id>/stream   ③ POST /api/run/<id>/say
   │    (Server Action)              (SSE, tail file)               ④ POST /api/run/<id>/stop
   ▼
bee-web ─── UID riêng · không token · không sudo · không docker
   │
   │ đọc trực tiếp                    ghi: KHÔNG BAO GIỜ
   │ /srv/bee/runs/<slug>/<num>/<id>/run.jsonl
   │
   │
   ├─ ①④ ghi một file yêu cầu vào /var/lib/bee-web/requests/  (thư mục của chính web)
   │        │
   │        ▼  inotify, dưới một giây
   │     bee-request.path → bee-request.service  (User=bee-orch)
   │        │  kiểm slug/num rồi systemctl start|stop bee-task@<slug>-<num>
   │        ▼
   │     worker.sh (bee-orch) — dựng worktree, gọi sudo agent-exec.sh
   │
   └─ ③ qua socket, đúng một việc: gửi một câu vào phiên đang chạy
        /run/bee/spec-chat.sock ── cầu nối, chạy dưới bee-agent
             └─ say → ghi một dòng JSON vào /run/bee/sessions/<id>.in  (FIFO)
                    │
                    ▼
        agent-exec.sh (bee-agent) — claude -p
              --input-format stream-json   ◄── FIFO (đường vào)
              --output-format stream-json  ──► run.jsonl (đường ra)
              --include-partial-messages
              --session-id <uuid do web sinh>
```

**Ranh giới không đổi một dòng:** `bee-web` không ghi vào `/srv/bee/**`;
`bee-agent` không có `GH_TOKEN`, không docker, không sudo; đúng **một** cây cầu
qua ranh giới UID, gỡ được bằng `systemctl disable --now bee-spec-chat`.

### 2.3 Chỗ khó nhất, nói trước

**`run.jsonl` hôm nay chỉ tồn tại ở nơi web không đọc được, cho tới khi phiên
kết thúc.** [`state.sh:174`](../../apps/reconciler/lib/state.sh#L174) `run_archive`
chép từ `state/<id>/` sang `/srv/bee/runs/…` **sau khi** worker thoát; trước đó
file nằm trong `state/<id>/`, thư mục mà `claim_clear` sẽ xoá.

Nghĩa là live view không phải "thêm một route đọc file có sẵn". Nó đòi thư mục
run được **mở lúc bắt đầu** thay vì lúc kết thúc. Đó là §3.1, và là thay đổi
reconciler thật sự đầu tiên của spec này.

---

## 3. Thay đổi trong `apps/reconciler/` — review riêng

### 3.1 Thư mục run mở lúc bắt đầu, không phải lúc kết thúc

`lib/state.sh`, tách `run_archive` thành hai:

| Hàm | Khi nào | Làm gì |
|---|---|---|
| `run_open <id> <slug> <num> <rule> <session_id>` | worker vừa nhận việc | Tạo `/srv/bee/runs/<slug>/<num>/<id>-<ts>/`, ghi `meta.json` với `result:"running"`, `chgrp`+`chmod g+rX` **ngay** để `bee-web` đọc được, in ra đường dẫn |
| `run_close <dir> <result>` | worker thoát | Cắt đuôi `run.jsonl` nếu quá `RUN_LOG_MAX_LINES`, ghi `usage.json`, cập nhật `meta.json` thành kết quả thật |

- `agent-exec.sh` ghi thẳng `run.jsonl` vào thư mục đó (`tee -a`), **không** ghi
  vào `state/<id>/` nữa. Ghi thẳng vào chỗ bền là cách duy nhất để không có một
  cửa sổ thời gian mà dữ liệu chỉ tồn tại ở chỗ sẽ bị xoá.
- **Cắt đuôi phải xảy ra ở `run_close`, không phải lúc đang ghi.** Cắt file mà
  web đang tail thì offset của người đọc trỏ vào giữa một dòng khác.
- `meta.json` thêm `status: "running" | "done" | "stopped" | "failed"` và
  `started_at`. Web dựa vào đó để biết nên tail hay chỉ đọc lịch sử.
- **Đồng bộ tay** `lib/bee/types.ts` trong cùng commit (luật [AGENTS.md §4](../../AGENTS.md)).

### 3.2 `agent-exec.sh` — thêm đường vào

Delta so với [dòng 52](../../apps/reconciler/bin/agent-exec.sh#L52):

```bash
# FIFO là đường vào của phiên. Mở READ-WRITE (`<>`) chứ không phải chỉ đọc:
# một FIFO chỉ-đọc sẽ nhận EOF ngay khi người ghi cuối cùng đóng, và claude sẽ
# coi đó là "hết đầu vào" rồi thoát giữa chừng. Giữ một fd ghi của chính mình
# là cách bắt nó không bao giờ thấy EOF.
FIFO="/run/bee/sessions/$ID.in"
mkfifo -m 0620 "$FIFO"          # group = group của cầu nối, để nó ghi vào được
exec 3<> "$FIFO"

exec timeout "$AGENT_TIMEOUT" \
  claude -p "$(cat "$PROMPT")" \
    --input-format stream-json --output-format stream-json --verbose \
    --include-partial-messages \
    --session-id "$SESSION_ID" \
    --dangerously-skip-permissions \
    --max-turns "$MAX_TURNS" \
    ${RESUME:+--resume "$RESUME"} \
  <&3 > >(tee -a "$RUN_JSONL") 2>&1
```

- `--session-id` do **web sinh** (UUID v4) và truyền xuống. Hôm nay session id chỉ
  biết được sau khi đọc stream; biết trước thì web đặt tên được cho mọi thứ ngay
  từ lúc bấm, và `--resume` về sau không phải đi tìm.
- `--include-partial-messages` là thứ làm chữ chạy mượt thay vì nhảy từng khối.
- Dọn FIFO trong `trap` cùng chỗ đang dọn worktree.

**`--max-turns 80` phải xem lại.** Nói chen làm một phiên dài hơn hẳn, và chạm
trần giữa chừng thì phiên chết trong khi người dùng đang gõ. V1: nâng trần cho
phiên live và **nói ra khi còn 10 lượt**. Trần chi tiêu thật là FR-3.4, mốc V3.

### 3.3 Khởi động và dừng — KHÔNG đi qua cầu nối

> **Đính chính so với bản nháp đầu.** Bản đầu cho cầu nối chạy
> `sudo systemctl start`. Không được: cầu nối chạy dưới `bee-agent`, mà
> [`sudoers/bee`](../../apps/reconciler/sudoers/bee) chỉ có đúng một dòng và nó
> dành cho `bee-orch`; [`polkit/49-bee.rules`](../../apps/reconciler/polkit/49-bee.rules)
> cũng chỉ cấp `bee-task@` cho `bee-orch`. Làm theo bản đầu thì phải cấp sudo
> cho `bee-agent` — tức phá đúng bất biến đắt nhất của cả hệ thống.

Đường đúng: **web ghi một file, systemd bắt inotify, orch khởi động.**

```
bee-web ─ghi─► /var/lib/bee-web/requests/<uuid>.json
               {"verb":"start"|"stop","slug":…,"num":…,"session_id":…,"by":…}
                     │  bee-request.path  (PathExistsGlob → inotify)
                     ▼  dưới một giây
               bee-request.service  (User=bee-orch, oneshot)
                     │  kiểm, rồi systemctl start|stop bee-task@<slug>-<num>
                     ▼  rồi XOÁ file yêu cầu
```

| Vì sao thế này | |
|---|---|
| Không quyền mới cho web | Nó chỉ ghi vào thư mục của chính nó (`StateDirectory=bee-web`) |
| Không daemon thứ hai | `.path` unit là thứ systemd đã có sẵn |
| Tức thì | inotify, không phải chờ tick 30 giây |
| Là nền cho V3 | Hàng đợi do app sở hữu (FR-2.1) cần đúng cơ chế này |

**`bee-request.service` phải coi file yêu cầu là đầu vào không tin cậy**, dù nó
do web ghi: `slug` khớp `^[a-z0-9][a-z0-9-]*$`, `num` khớp `^[0-9]+$`, và `slug`
phải có trong `/etc/bee/repos.d/`. Ghép chuỗi thẳng vào tên unit là đường thoát
ra khỏi mọi thứ, vì unit đó chạy dưới `bee-orch` — user có token và docker.

Quyền: thư mục `0750 bee-web:bee-web`, `bee-orch` thuộc group `bee-web` để đọc.
Chiều ngược lại **không** mở: web vẫn không đọc được gì của orch.

### 3.3b Cầu nối `bin/spec-chat.mjs` — thêm đúng một lệnh

| Lệnh | Làm gì | Kiểm gì trước khi làm |
|---|---|---|
| `say` | Ghi một dòng `{"type":"user","message":{…}}` vào `/run/bee/sessions/<id>.in` | `id` khớp `^[A-Za-z0-9._-]+$` · FIFO tồn tại · độ dài ≤ 32 KB |

Chỉ một lệnh, vì chỉ có đúng một việc thật sự **phải** chạy dưới `bee-agent`:
ghi vào stdin của một tiến trình do `bee-agent` sở hữu.

- **Danh sách CHO PHÉP, không ghép chuỗi** — giữ đúng cách file này đang làm với
  `mode`.
- `route.ts` đã kiểm một lần ở phía web
  ([route.ts:37](../../apps/web/src/app/api/spec-chat/route.ts#L37)); cầu nối
  kiểm lại lần nữa. Hai lần vì đây là chỗ vượt ranh giới UID.
- Trần đồng thời (`bee-spec-chat` đã có) áp cho cả lệnh mới.


### 3.4 Vòng đời, khoá, dọn — không viết gì mới

Dùng nguyên: khoá của `bee-task@` (start lần hai bị từ chối) · `bee.slice` ·
`rule 01` dọn phiên chết trong một tick · `.agent/PAUSE` và `/etc/bee/PAUSE`.

**Đây là toàn bộ lý do chọn phương án lai.** Một daemon giữ phiên trong RAM sẽ
phải viết lại cả bốn thứ này, và cả bốn đều đã được nghiệm thu trên máy thật
(P0.4, P0.5, P2.1).

`stop` phải dừng **sạch**: worktree được dọn, `meta.json` ghi `status:"stopped"`,
không để lại FIFO mồ côi trong `/run/bee/sessions/`.

---

## 4. Thay đổi trong `apps/web/`

### 4.1 Feature slice mới: `features/run-live/`

```
features/run-live/
├── api/
│   ├── start.ts        # server action: tạo issue → gọi cầu nối start
│   ├── say.ts          # server action: gửi một câu vào phiên đang chạy
│   └── stop.ts         # server action
├── components/
│   ├── live-view.tsx       # khung: dòng sự kiện + ô gõ + nút dừng
│   ├── event-stream.tsx    # render từng sự kiện theo loại
│   └── run-status-bar.tsx  # trạng thái · lượt · thời lượng · hạn mức
├── hooks/use-run-stream.ts # EventSource + nối lại theo offset
├── lib/parse-events.ts     # stream-json thô → sự kiện hiển thị được
└── index.ts
```

`lib/parse-events.ts` là **thuần, không I/O**, nên test được không cần máy chạy —
và nó là chỗ dễ sai nhất (hình dạng stream-json thay đổi theo phiên bản CLI).

### 4.2 Route SSE: `app/api/run/[id]/stream/route.ts`

- `import "server-only"`, **tự kiểm session** — không tin `proxy.ts`.
- Đường dẫn tới thư mục run đi qua `resolveEvidencePath` (đã có, đã test chặn
  path traversal). Không viết hàm giải đường dẫn thứ hai.
- Tail: đọc từ một offset byte, phát mỗi dòng thành một `data:` SSE, `id:` là
  offset mới. Client nối lại bằng `Last-Event-ID` → **không mất khúc giữa** khi
  mạng điện thoại rớt.
- Lần đầu gắn vào một phiên đã chạy được một lúc: gửi **N dòng cuối** kèm một sự
  kiện `bee_replayed` nói rõ đã bỏ qua bao nhiêu. Không im lặng cắt.
- `meta.json` có `status != "running"` → phát nốt phần còn lại rồi **đóng**.
  Không để một EventSource treo vĩnh viễn trên một phiên đã xong.
- Nhịp đọc: 250 ms. Đủ mượt cho mắt người, đủ rẻ cho một máy chạy 24/7.

### 4.3 "Ok làm đi" — cửa chặn duy nhất

Trong đúng cửa sổ phỏng vấn đang có ([`create-task-dialog.tsx`](../../apps/web/src/features/task-new/components/create-task-dialog.tsx)),
khi agent đã in ra hợp đồng thì hiện **một** nút. Bấm vào:

1. Sinh `session_id` (UUID v4) phía server.
2. Tạo GitHub issue **bằng token người bấm**, gắn nhãn trạng thái để đọc.
3. Gọi cầu nối `start`.
4. `redirect()` sang trang live.

**Không có bước thứ năm.** Không màn hình xác nhận, không gắn nhãn tay, không
chờ tick. Nếu bước nào trong bốn bước này hỏng thì nói ra *bước nào* — "tạo issue
xong nhưng không khởi động được phiên" là một câu hoàn toàn khác với "không tạo
được issue", và người dùng phải làm hai việc khác nhau.

### 4.4 Màn hình live

- Dòng sự kiện xen kẽ: chữ của agent · tool call (tên + tham số rút gọn) · kết
  quả tool (gập lại, mở ra xem được) · lỗi.
- **Ô gõ luôn mở** trong lúc phiên chạy. Gửi → dòng của mình xuất hiện ngay,
  đánh dấu `đang chờ agent đọc`; sự kiện đầu tiên sau đó gỡ dấu.
- Nút **Dừng** luôn thấy, không giấu trong menu.
- Phiên đã xong → thanh trạng thái đổi, ô gõ đóng lại, hiện link PR.
- **Mobile-first.** Dòng sự kiện là cột dọc; ô gõ dính đáy màn hình.
- Rớt mạng → dải báo "mất kết nối, đang thử lại", **không** xoá những gì đã hiện.

---

## 5. Lệnh

```bash
cd apps/web
pnpm dev                  # http://127.0.0.1:3187
pnpm lint                 # eslint, gồm no-restricted-imports cho barrel
pnpm typecheck            # tsc --noEmit
pnpm test                 # vitest
pnpm test:e2e             # playwright
pnpm build                # BẮT BUỘC — bắt lỗi Server/Client mà dev bỏ qua

# phía reconciler — không có test suite, verify bằng rig
cd apps/reconciler
bash -n bin/*.sh lib/*.sh rules/*.sh    # sàn, không phải đích
be dry-run                              # in ra nó ĐỊNH làm gì
```

Bốn lệnh `lint typecheck test build` xanh cả bốn trước khi coi một task là xong.

---

## 6. Cấu trúc — thêm gì vào chỗ đã có

```
apps/reconciler/
├── bin/agent-exec.sh          # SỬA: --input-format, FIFO, --session-id
├── bin/spec-chat.mjs          # SỬA: thêm đúng một lệnh `say`
├── bin/request-run.sh         # MỚI: đọc file yêu cầu, kiểm, start/stop unit
├── systemd/bee-request.path   # MỚI: inotify
├── systemd/bee-request.service# MỚI: chạy dưới bee-orch
├── bin/worker.sh              # SỬA: gọi run_open trước, run_close sau
└── lib/state.sh               # SỬA: tách run_archive → run_open + run_close

apps/web/src/
├── app/api/run/[id]/stream/route.ts   # MỚI: SSE
├── features/run-live/                 # MỚI: cả slice
├── features/task-new/                 # SỬA: nút "ok làm đi"
└── lib/bee/types.ts                   # SỬA: meta.json thêm status, started_at

/srv/bee/runs/<slug>/<num>/<id>-<ts>/  # ĐỔI Ý NGHĨA: mở lúc bắt đầu
├── run.jsonl                          # agent ghi thẳng, web tail
├── meta.json                          # status: running | done | stopped | failed
└── usage.json                         # ghi lúc đóng

/run/bee/sessions/<id>.in              # MỚI: FIFO, đường vào của phiên
/var/lib/bee-web/requests/<uuid>.json  # MỚI: web ghi, orch đọc rồi xoá
```

---

## 7. Code style

Quy ước đầy đủ ở [`AGENTS.md`](../../AGENTS.md) §3 và §4. Một đoạn thật cho chỗ
dễ sai nhất của spec này — đọc thêm từ một offset mà không bao giờ phát nửa dòng:

```ts
/**
 * Đọc phần mới của `run.jsonl` kể từ `offset`.
 *
 * Trả về `rest` là khúc đuôi CHƯA có `\n`. Một dòng JSON có thể bị cắt làm đôi
 * giữa hai lần đọc — phát nửa dòng đó ra SSE thì client `JSON.parse` hỏng và
 * mất luôn sự kiện. Giữ lại, ghép với lần đọc sau.
 */
async function readMore(file: string, offset: number, rest: string) {
  const fh = await fs.open(file, "r");
  try {
    const { size } = await fh.stat();
    if (size <= offset) return { dong: [], offset, rest };

    const buf = Buffer.allocUnsafe(size - offset);
    await fh.read(buf, 0, buf.length, offset);

    const phan = (rest + buf.toString("utf8")).split("\n");
    return { dong: phan.slice(0, -1), offset: size, rest: phan.at(-1) ?? "" };
  } finally {
    await fh.close();
  }
}
```

Tiếng Việt cho comment và tên biến nội bộ, tiếng Anh cho chuỗi hiện ra màn hình —
theo đúng thứ repo đang làm. `any` bị cấm; stream-json vào bằng `unknown` rồi thu
hẹp trong `parse-events.ts`.

---

## 8. Kiểm thử

| Tầng | Công cụ | Phủ cái gì |
|---|---|---|
| Thuần | Vitest | `parse-events.ts` với stream-json thật ghi lại từ một phiên · `readMore` với dòng bị cắt đôi |
| Component | Vitest + Testing Library | Màn live: đang chạy / đã xong / mất kết nối / phiên rỗng. Query theo role và label |
| Route | Vitest + MSW | SSE nối lại theo `Last-Event-ID` · từ chối khi không có session · từ chối path traversal |
| E2E | Playwright | Ok làm đi → thấy chữ chạy → gõ chen → dừng. Chạy trên một `run.jsonl` giả được ghi dần |
| Rig bash | thủ công | `run_open` → giết worker giữa chừng → rule 01 dọn → `meta.json` không kẹt ở `running` |

**Bốn tình huống bắt buộc có test, vì chúng hỏng im lặng:**

1. `run.jsonl` bị cắt đôi giữa một dòng JSON → không phát nửa dòng.
2. Gắn vào phiên đã chạy 10 phút → hiện `bee_replayed`, **không** im lặng cắt.
3. Phiên chết giữa chừng (`kill -9`) → UI báo đã dừng, không quay spinner mãi.
4. `say` với `id` chứa `../` → **bị từ chối ở cả hai phía**, web và cầu nối.

---

## 9. Ranh giới

**Luôn luôn**
- Mọi ghi lên GitHub mang token của **đúng người vừa bấm**.
- Mọi route handler tự kiểm session.
- `import "server-only"` cho mọi module chạm đĩa, socket, hoặc token.
- Mọi giá trị từ trình duyệt đi vào `argv`/đường dẫn phải qua **danh sách cho
  phép**, kiểm ở **cả hai** phía ranh giới UID.
- Hiển thị dữ liệu cũ **là** cũ; trạng thái chờ phải nói đang chờ *cái gì*.

**Hỏi trước**
- Bất cứ thay đổi nào trong `apps/reconciler/` ngoài đúng những file ở §6.
- Thêm dependency runtime mới ở web.
- Đổi trần `--max-turns`, `AGENT_TIMEOUT`, hoặc trần đồng thời của cầu nối.
- Mở thêm bất cứ lệnh nào qua cầu nối ngoài `say`.
- Thêm động từ vào `bee-request.service` ngoài `start` / `stop`.

**Không bao giờ**
- `bee-web` ghi vào `/srv/bee/**`.
- `bee-web` giữ `GH_TOKEN`, chạy `docker`/`systemctl`/`sudo`/`bee` trực tiếp.
- Cho `bee-agent` token GitHub, group `docker`, hoặc sudo.
- Cấp sudo, polkit, hay group `docker` cho `bee-agent` hoặc `bee-web` — kể cả
  “chỉ một lệnh nhỏ”. Spec này đã sai đúng chỗ đó một lần rồi.
- Bắc cây cầu thứ hai qua ranh giới UID. Có đúng một socket, và nó gỡ được bằng
  một lệnh.
- Merge PR (nút merge là V2, không phải mốc này).
- `if (isFixture)` ở tầng UI.

---

## 10. Tiêu chí nghiệm thu V1

- [ ] Nói ý tưởng → agent phỏng vấn → bấm một nút → **chữ chạy trong < 5 giây**
- [ ] Issue xuất hiện trên GitHub **mang tên người bấm**, kèm hợp đồng đầy đủ
- [ ] Nhìn thấy agent đọc file nào, chạy lệnh gì — không phải một spinner
- [ ] Gõ chen một câu giữa chừng → agent tiếp thu, thấy được trong dòng sự kiện
- [ ] Bấm Dừng → dừng trong **< 5 giây**, worktree dọn sạch, không FIFO mồ côi
- [ ] Đóng trình duyệt 10 phút rồi mở lại → phiên vẫn chạy, xem tiếp được, có
      `bee_replayed` nói rõ đã bỏ qua bao nhiêu
- [ ] `systemctl restart bee-web` giữa lúc agent làm → phiên **không hề hấn**
- [ ] `kill -9` worker → UI báo đã dừng; tick sau rule 01 dọn; `meta.json` không
      kẹt ở `running`
- [ ] Phiên xong → có draft PR, link mở được sang GitHub
- [ ] Làm được **toàn bộ** những việc trên **trên điện thoại, ngoài mạng nhà**
      (4G + app Tailscale bật, mở https://ducba.tail7d9c45.ts.net, GitHub
      OAuth thật)
- [ ] Người ngoài allowlist đăng nhập được nhưng **không thấy gì**
- [ ] `say` với `id` chứa `../` bị từ chối ở cả hai phía
- [ ] File yêu cầu với `slug` lạ hoặc chứa `@` `/` `..` → bị từ chối, **không**
      unit nào được start
- [ ] `sudo -u bee-agent -n true` vẫn FAIL · `sudo -u bee-web -n true` vẫn FAIL
- [ ] `pnpm lint typecheck test build` xanh cả bốn

---

## 11. Việc chưa quyết

| | Ghi chú |
|---|---|
| Trần `--max-turns` cho phiên live | 80 là trần của phiên tự chạy. Nói chen làm phiên dài hơn hẳn. Chốt một con số, và nói ra khi còn 10 lượt |
| Bao nhiêu phiên live song song | Pool `build` hiện là mấy slot? Live tranh slot với rule 07 hay có pool riêng? |
| `run.jsonl` phình lúc đang chạy | `RUN_LOG_MAX_LINES` chỉ áp lúc đóng. Một phiên chạy 3 tiếng có thể ăn hết đĩa. Cần trần theo byte lúc đang ghi |
| Quyền của FIFO | `0620` với group nào — group của cầu nối hay `bee`? Installer phải là chỗ quyết, đọc tại chỗ như `run_root` đang làm |
| Nói chen lúc agent đang giữa một tool call | CLI nhận vào hàng đợi hay bỏ? **Phải thử trên máy thật trước khi viết UI** |

> Ô cuối là rủi ro lớn nhất của spec này. Nó quyết định UI hứa gì với người dùng
> khi họ gõ một câu lúc agent đang chạy `pnpm test` — và hứa sai thì tệ hơn không
> hứa. Thử bằng một rig trước, không suy luận từ tài liệu.
</content>
