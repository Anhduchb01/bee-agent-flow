# SPEC — bee trên Slack (cửa thứ hai, một người dùng)

Đặc tả kỹ thuật cho con bot Slack của bee: **báo** khi phiên đổi trạng thái,
**trả lời** chuyện của repo, **ghi** một cuốn sổ tay, và **tạo issue** khi bị
tag trong kênh công ty.

**Đầu vào đã chốt:** phỏng vấn 26/08/2026 — bốn phát hiện đã chốt (§0.1) ·
[`AGENTS.md`](../../AGENTS.md) · [PRD 3.x](../PRD_bee-agent-flow.md) (mô hình A+)
**Trạng thái:** bản nháp đầu, chờ duyệt. **Chưa viết dòng code nào.**
**Thừa kế:** nếp oneshot + timer lấy nguyên từ `reaper` / `gc` / `heartbeat`;
phanh hạn mức lấy nguyên `checkQuota` của
[session-first](session-first.md) §4.

---

## 0. Những gì spec này KHÔNG làm

- **Không mở, không dừng, không điều khiển phiên từ Slack.** Slack không chạm
  `systemctl`, không chạm FIFO. Mở phiên vẫn chỉ có một cửa là web.
- Không phân quyền. Đúng **một** `SLACK_USER_ID` ra lệnh được; mọi tin khác
  không tồn tại.
- Không Gmail, không Calendar.
- Không `claude-mem`. Đó là trí nhớ của *agent*, cắm phía phiên, việc khác.
- Không vector search, không Mem0, không Zep ở bất kỳ giai đoạn nào trong spec
  này — xem §12.
- Không đụng `apps/reconciler/`.

### 0.1 Bốn phát hiện đã chốt (nền của mọi quyết định dưới đây)

| # | Phát hiện | Hệ quả trong spec |
|---|---|---|
| 01 | Slack không mở phiên nhưng **vẫn ăn quota** — cùng cửa sổ mà `quota-gate` dùng để phanh autopilot (đo 25/08: 5h ở 10%, 7 ngày ở 34%) | §3.3 — mọi lượt chat qua `checkQuota` với ngưỡng riêng, chặt hơn phiên |
| 02 | Agent SDK không được đem login claude.ai vào sản phẩm bên thứ ba | §3.3 — gọi `claude -p` như tiến trình con, đúng lối `session-run.sh` |
| 03 | Anthropic không có endpoint embedding | §4 — FTS5, không vector |
| 04 | Workspace công ty chặn được app; app Socket Mode không lên Marketplace được | §2.1 — hai app, một bức tường |

---

## 1. Mục tiêu — bốn câu kiểm được

1. **Thả một phiên chạy, đóng trình duyệt, đi ngủ.** Điện thoại kêu **đúng một
   lần** khi nó xong — không kêu sớm, không kêu lại, không im.
2. **Nhịp đầu tiên sau khi cài không nói gì cả.** Máy đang có 11 phiên cũ đều
   ở trạng thái cuối; một cái chuông đúng sẽ im lặng seed rồi mới bắt đầu nghe.
3. **Ghi một note, một tuần sau hỏi lại bằng từ khác hẳn**, và nó lôi ra đúng
   cái đó.
4. **Slack bận không bao giờ làm autopilot bị phanh oan.** Khi hạn mức căng,
   thứ dừng trước là Slack.

Câu 2 là câu dễ làm hỏng nhất và là lý do §3.1 tồn tại như một module thuần
có test riêng.

---

## 2. Kiến trúc

### 2.1 Hai mặt Slack, một bức tường

```
Workspace RIÊNG (anh là chủ)          Workspace CÔNG TY (admin là chủ)
  #chuong  #so-tay                      kênh có đồng nghiệp
        │                                        │
        │  app A: xoxb + xapp                    │  app B: xoxb
        │  scope: chat/im/channels/groups        │  scope: chat:write
        │  events: app_mention, message.*        │  events: app_mention
        ▼                                        ▼
   ┌────────────────────────────────────────────────────┐
   │  bee-slack.service — hai client, MỘT tiến trình     │
   └────────────────────────────────────────────────────┘
        │                                        │
        ▼                                        ▼
   bee-brain (repo riêng tư)              gh issue — repo công ty
   note · quyết định · con trỏ            KHÔNG ghi xuống đĩa riêng
```

**Bức tường là cấu trúc, không phải điều kiện.** App B đăng ký đúng
`app_mention` và giữ đúng `chat:write`, nên nó *không đọc được* tin trong kênh
mà nó không bị tag — do phạm vi quyền, không do chính sách. Lane công ty
**không được cấp công cụ ghi note**; rò rỉ là một luồng code không tồn tại, chứ
không phải một `if (team_id === …)` có thể viết sai.

Hệ quả bắt buộc: **app B là một app Slack thứ hai**, không phải cùng app phân
phối vào hai workspace.

### 2.2 Vì sao giai đoạn 1 không cần Socket Mode

Socket Mode tồn tại để **nhận** sự kiện. Một con bot chỉ *nói* thì cần đúng một
lệnh `chat.postMessage` qua HTTPS đi ra — không WebSocket, không app-level
token, không giữ kết nối, **không có gì để mà rớt lúc 3h sáng**.

Nên giai đoạn 1 không có tiến trình thường trú. Nó là **oneshot + timer**, đúng
nếp `reaper` / `gc` / `heartbeat` / `tick` đang dùng, kể cả `Persistent=true` để
máy tắt qua đêm thì lần bật kế tiếp vẫn báo. Trễ ≤ 30s, và với "phiên xong lúc
2h sáng" thì 30s không phải là con số ai đo.

Tiến trình thường trú chỉ xuất hiện ở giai đoạn 2, cùng lúc với Socket Mode.

### 2.3 Đường đi của một thông báo (giai đoạn 1)

```
bee-notify.timer  ──30s──▶  bee-notify.service (oneshot, Type=oneshot)
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
       đọc sessions/*/meta.json      đọc state/notified.json (ảnh chụp)
                     └─────────────┬─────────────┘
                                   ▼
                      announcementsFor(prev, curr)   ← LUẬT THUẦN, có test
                                   │
                      rỗng ────────┴──────── có việc
                        │                       │
                     thoát 0          POST chat.postMessage
                                                │
                              thành công ───────┴─────── lỗi
                                    │                      │
                     cập nhật ảnh chụp CHO PHIÊN ĐÓ    giữ nguyên
                                                        (nhịp sau thử lại)
```

Ảnh chụp cập nhật **theo từng phiên sau khi Slack nhận**, không phải ghi đè cả
file. Slack sập một giờ nghĩa là một cụm tin đến muộn — đúng hành vi mong muốn,
không phải mất tin.

---

## 3. `apps/slackbot/` — app thứ tư

Không phải `web`, không phải `runner`. AGENTS.md §1 cấm trộn; đây là mối quan
tâm thứ tư nên nó có thư mục riêng.

**Giai đoạn 1 có ZERO dependency runtime.** Node 22 đã có `fetch` sẵn;
`chat.postMessage` là một POST. `@slack/*` chỉ vào ở giai đoạn 2 cùng Socket
Mode.

```
apps/slackbot/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── notify/
│   │   ├── diff.ts            LUẬT THUẦN — không I/O, không fetch
│   │   ├── diff.test.ts
│   │   ├── message.ts         Announcement → block Slack + link web
│   │   ├── message.test.ts
│   │   └── run.ts             nối dây: đọc đĩa → diff → post → ghi ảnh chụp
│   ├── slack/
│   │   └── post.ts            chat.postMessage, retry, phân biệt lỗi tạm/vĩnh viễn
│   ├── config.ts              đọc env, thất bại là giá trị trả về
│   └── bin/notify.ts          entrypoint oneshot
└── systemd/
    ├── bee-notify.service
    └── bee-notify.timer
```

### 3.1 `notify/diff.ts` — luật thuần

Đây là phần duy nhất đáng viết test, và là phần sống sót nguyên vẹn sang giai
đoạn 2. Không I/O, không `Date.now()` ẩn — thời gian là tham số.

```ts
export type SessionState = {
  id: string;
  status: "starting" | "running" | "done" | "stopped" | "failed";
  needsHuman: boolean;
  endedAt: string | null;
};

export type Announcement =
  | { kind: "done"; id: string; title: string | null }
  | { kind: "failed"; id: string; title: string | null }
  | { kind: "needs_human"; id: string; title: string | null };

/**
 * Chỉ nói khi có CHUYỂN TIẾP, không bao giờ nói vì trạng thái đứng yên.
 *
 * `prev` rỗng nghĩa là chưa từng chạy nhịp nào — trả về rỗng và để người gọi
 * seed ảnh chụp. Máy đang có 11 phiên cũ đều ở trạng thái cuối; không có luật
 * này thì lần cài đặt đầu tiên bắn 11 tin vào mặt người dùng lúc nửa đêm.
 */
export function announcementsFor(
  prev: Record<string, SessionState> | null,
  curr: Record<string, SessionState>,
): Announcement[];
```

**Bảng chân trị — mỗi dòng là một test:**

| `prev` | `curr` | Nói? |
|---|---|---|
| `null` (nhịp đầu) | bất kỳ, kể cả 11 phiên `failed` | **Không** — seed im lặng |
| vắng mặt | `running` | Không — phiên mới không phải tin |
| `running` | `done` | **Có** — `done` |
| `running` | `failed` | **Có** — `failed` |
| `done` | `done` | Không |
| `failed` | `failed` | Không |
| `needsHuman: false` | `needsHuman: true` | **Có** — `needs_human` |
| `needsHuman: true` | `needsHuman: false` | Không |
| `running` | vắng mặt (gc dọn) | Không — chỉ bỏ khỏi ảnh chụp |
| `running` | `stopped` | Không — người tự dừng thì người đã biết rồi |

Ba `kind`, không hơn. Thêm loại sự kiện là đổi spec, không phải đổi code.

### 3.2 `bee-notify.service` + `.timer`

Sao nguyên nếp `bee-reaper`: `Type=oneshot`, `PATH` render đầy đủ (user unit có
`PATH` trần), `TimeoutStartSec` ngắn để việc dài bị systemd giết và bug lộ ngay
thay vì âm ỉ.

```ini
# bee-notify.timer
OnBootSec=1min
OnUnitInactiveSec=30s     # đếm từ lúc nhịp trước KẾT THÚC — không chồng nhau
Persistent=true           # máy tắt qua đêm, bật lại vẫn báo
```

Thoát khác 0 chỉ khi **không chạy nổi** (thiếu token, không đọc được
`BEE_ROOT`). Slack trả 5xx là chuyện bình thường của một nhịp — log rồi thoát 0,
nhịp sau thử lại.

### 3.3 `bee-slack.service` — giai đoạn 2

Tiến trình thường trú, Socket Mode, `Restart=on-failure`. Cái chết im lặng của
WebSocket bắt bằng đúng bài `bee-heartbeat` đang dùng cho reaper: ghi
`state/slack-heartbeat.json` mỗi lần nhận được ping, và `doctor.sh` đọc nó.

Bốn luật cứng:

1. **Allowlist ở lớp ngoài cùng.** So `SLACK_USER_ID` **trước khi** đọc nội
   dung tin. Không phải một nhánh sâu trong hàm xử lý.
2. **Phanh hạn mức là bắt buộc.** Mọi lượt gọi model qua `checkQuota` với ngưỡng
   riêng đọc từ `web.env` (`SLACK_QUOTA_MAX_PERCENT`), đặt chặt hơn ngưỡng
   phiên. Bị phanh thì trả lời bằng chữ, nói rõ còn bao nhiêu và lúc nào reset.
3. **Bộ não là `claude -p` tiến trình con**, không nhúng thư viện — cùng auth,
   cùng đường với `session-run.sh`, không sinh ra cách đăng nhập thứ hai.
4. **Không `systemctl`, không FIFO.** Nếu có dòng code nào gọi tới, review từ
   chối.

---

## 4. Kho sổ `bee-brain` — giai đoạn 3

Repo riêng tư, tách khỏi repo này, chỉ chứa markdown.

**Nguyên tắc gốc — mọi lựa chọn phía sau đảo được nhờ nó:**
> **Markdown là nguồn sự thật. Index là thứ vứt đi rồi dựng lại được.**

```
bee-brain/
├── README.md              luật của kho
├── INDEX.md               mục lục — SINH TỰ ĐỘNG, người không sửa
├── notes/2026-08/         một file = một ý, tên có ngày
├── refs/                  con trỏ ra ngoài: URL, dashboard, ticket
├── people/                ai là ai — ngữ cảnh, không phải danh bạ
├── .bee/
│   ├── schema.md          hợp đồng frontmatter — bot đọc file NÀY
│   ├── memory.db          FTS5 · gitignored · xoá lúc nào cũng dựng lại
│   └── pending/           note kẹt vì conflict, chờ người xử
└── .gitignore
```

**Không có thư mục phân loại và không có `inbox/`.** Cả hai đòi một quyết định
lúc ghi — mà lúc ghi là lúc anh đang đứng chờ thang máy. Phân loại nằm ở
frontmatter `type`; đổi loại là sửa một dòng, không phải `git mv`.

### 4.1 Hợp đồng frontmatter

```yaml
---
id: 2026-08-26-quota-gate-doi-ngay    # = tên file. KHÔNG BAO GIỜ đổi.
type: note                             # note|decision|ref|person|task — đúng 5
title: Quota gate tính sai lúc đổi ngày
created: 2026-08-26T22:14:00+07:00     # lúc NGƯỜI nói, không phải lúc ghi file
source: slack                          # slack|web|tay
tags: [bee, quota, bug]
repo: Anhduchb01/bee-agent-flow        # vắng mặt là bình thường
links: [phanh-han-muc]                 # trỏ tới id khác; trỏ tới thứ chưa có là hợp lệ
status: open                           # CHỈ có nghĩa với type: task
---
```

`id` tách khỏi `title` để sửa tiêu đề không làm gãy liên kết chéo. `created`
tách khỏi thời điểm ghi vì hai cái lệch nhau khi bot đang retry hoặc máy vừa
bật lại. `source` tồn tại vì note người gõ tay và note bot ghi hộ có chất lượng
khác nhau, và sáu tháng nữa sẽ cần biết cái nào là cái nào.

### 4.2 Sáu luật của kho

1. `memory.db` **không bao giờ** commit. Xoá lúc nào cũng dựng lại từ file.
2. `INDEX.md` do máy sinh; người sửa tay là công thức của conflict lúc 2h sáng.
3. Một note một commit, message là tiêu đề note. `git log` thành nhật ký, miễn
   phí. Push gộp theo cụm.
4. `pull --rebase` trước mọi lần ghi, **không bao giờ** force. Conflict thì note
   rơi vào `.bee/pending/` và Slack báo — hỏng ồn ào, không mất im lặng.
5. Chuyện từ kênh công ty **không bao giờ** thành note. Nó thành issue.
6. Tìm kiếm là FTS5 + để `claude -p` xếp lại top-30. Không vector (§12).

---

## 5. Bố cục đĩa

```
$BEE_ROOT/                              (= ~/.local/srv/bee)
├── slack.env                           MỚI — token Slack. chmod 600.
├── state/
│   ├── notified.json                   MỚI — ảnh chụp trạng thái phiên đã báo
│   └── slack-heartbeat.json            MỚI — giai đoạn 2
├── brain/                              MỚI — clone của bee-brain, giai đoạn 3
│   └── .bee/memory.db
└── … (sessions/, work/, web.env, claude.env: không đổi)
```

`slack.env` là file thứ ba cùng nếp với `web.env` và `claude.env`.
**Không** dùng `env.d/` — chỗ đó dành cho env **theo repo** (`env.d/<slug>/`),
trộn vào là làm hỏng một quy ước đang đúng.

---

## 6. Cấu hình và khoá

| Biến | Ở đâu | Giai đoạn | Ghi chú |
|---|---|---|---|
| `SLACK_BOT_TOKEN` | `slack.env` | 1 | `xoxb-…`, workspace riêng |
| `SLACK_CHANNEL_ALERTS` | `slack.env` | 1 | id kênh `#chuong` |
| `BEE_PUBLIC_URL` | `web.env` | 1 | gốc URL tailnet, để dựng link phiên |
| `SLACK_APP_TOKEN` | `slack.env` | 2 | `xapp-…`, scope `connections:write` |
| `SLACK_USER_ID` | `slack.env` | 2 | **đúng một** id được ra lệnh |
| `SLACK_QUOTA_MAX_PERCENT` | `web.env` | 2 | ngưỡng phanh riêng cho Slack |
| `BRAIN_REPO` / `BRAIN_PAT` | `slack.env` | 3 | PAT fine-grained **đúng một repo** |
| `SLACK_CORP_BOT_TOKEN` | `slack.env` | 4 | app B, workspace công ty |

**Luật khoá cứng:** `BRAIN_PAT` **không bao giờ** vào `claude.env` hay bất cứ
file nào phiên đọc được. Nếu nó nằm chỗ phiên với tới, thì mọi agent đều viết
lại được não người dùng. `slack.env` chỉ `bee-notify.service` và
`bee-slack.service` đọc.

### 6.1 Manifest app Slack

Cấu hình app A nằm ở [`slack-app-manifest.yaml`](slack-app-manifest.yaml) —
dán vào *Create New App → From an app manifest*.

Nó khai **đủ scope cho cả giai đoạn 1→3 ngay từ đầu**, và đó là cố ý: thêm
scope sau buộc phải cài lại app, mà cài lại thì Slack **cấp token `xoxb-`
mới**. Set dần nghĩa là đổi token trong `slack.env` ba lần, mỗi lần một cơ hội
để quên. Giai đoạn 1 chỉ thực sự dùng `chat:write`; phần còn lại nằm im, và
Socket Mode bật mà không ai mở kết nối thì event đơn giản không được giao.

App B (workspace công ty, giai đoạn 4) có manifest **riêng**, chỉ
`app_mention` + `chat:write` — xem §2.1.

---

## 7. Lệnh

```bash
cd apps/slackbot
pnpm lint / typecheck / test / build          # bốn cổng, như apps/web

# chạy tay một nhịp, không gửi gì — in ra thứ NÓ ĐỊNH nói
node dist/bin/notify.js --dry-run

# chạy tay một nhịp thật
systemctl --user start bee-notify
journalctl --user -u bee-notify -n 50

systemctl --user list-timers 'bee-*'          # nhìn cả họ timer
```

`--dry-run` không phải tiện nghi: nó là cách duy nhất kiểm luật §3.1 trên dữ
liệu thật mà không bắn tin. Nghiệm thu §11 dùng nó.

`deploy.sh` phải học cài thêm `apps/slackbot/systemd/*` — một lệnh deploy, không
sinh ra đường cài thứ hai.

---

## 8. Code style

Theo AGENTS.md: **định danh, route và comment mới viết bằng tiếng Anh**; tài
liệu tiếng Việt; định danh tiếng Việt đang có ở `apps/web` giữ nguyên cho tới
khi refactor tự nhiên.

```ts
/**
 * Only a TRANSITION speaks. A steady state never does.
 *
 * A null `prev` means no tick has ever run: return nothing and let the caller
 * seed the snapshot. Without this, first install fires one message per finished
 * session — eleven of them, at whatever hour the timer first ticks.
 */
export function announcementsFor(
  prev: Record<string, SessionState> | null,
  curr: Record<string, SessionState>,
): Announcement[] {
  if (prev === null) return [];
  const out: Announcement[] = [];
  for (const [id, now] of Object.entries(curr)) {
    const was = prev[id];
    if (!was) continue;                       // new session is not news
    ...
  }
  return out;
}
```

Ba quy ước bắt buộc:

- **Thất bại là giá trị trả về, không phải exception ném lên.** Cùng bài
  `session-ctl.ts`: `{ ok: true } | { ok: false; message: string }`.
- **Luật thuần tách khỏi I/O.** `diff.ts` và `message.ts` không import `node:fs`
  và không gọi `fetch`. `run.ts` là nơi duy nhất có tác dụng phụ.
- **Comment nói *vì sao*, không nói *cái gì*.** Mỗi luật lạ trong §3.1 phải có
  một câu giải thích nó chặn hỏng gì — nếu không, người sau sẽ "dọn" nó đi.

---

## 9. Kiểm thử

| Tầng | Công cụ | Phủ |
|---|---|---|
| Thuần | Vitest | `announcementsFor` — **cả 10 dòng bảng chân trị §3.1** · `message.ts` dựng link đúng khi `BEE_PUBLIC_URL` có/không dấu `/` cuối |
| I/O | Vitest + fs tạm | `run.ts`: ảnh chụp thiếu → seed, không post · post lỗi → ảnh chụp phiên đó **không** tiến · post ok → tiến đúng một phiên |
| Slack | Vitest + MSW | 429/5xx → retry, thoát 0 · 401 → thoát khác 0 và nói rõ token hỏng |
| Giai đoạn 2 | Vitest | tin từ id khác `SLACK_USER_ID` → không đi tới đâu (test này là **bắt buộc**, không phải nên có) · hạn mức vượt ngưỡng → không gọi model |
| Rig | thủ công máy thật | bảng dưới |

**Rig bắt buộc — toàn bộ là loại hỏng-im-lặng:**

1. `rig-16-notify-first-run.sh` — máy có 11 phiên cũ, chạy nhịp đầu →
   **không tin nào được gửi**, `notified.json` được seed đủ 11 phiên.
2. `rig-17-notify-once.sh` — phiên chạy → xong. Chạy 5 nhịp liên tiếp →
   **đúng một tin**.
3. `rig-18-notify-slack-down.sh` — chặn `slack.com` ở tầng mạng, phiên xong,
   3 nhịp → không tin; bỏ chặn, một nhịp → tin đến, không nhân đôi.
4. `rig-19-notify-gc.sh` — phiên bị `gc` dọn giữa hai nhịp → không tin, không
   crash, id biến khỏi ảnh chụp.
5. `rig-20-slack-stranger.sh` *(giai đoạn 2)* — người khác nhắn → **im lặng
   tuyệt đối**, không cả "tôi không hiểu", và `journalctl` không có dòng nào gọi
   model.
6. `rig-21-slack-quota.sh` *(giai đoạn 2)* — đẩy hạn mức lên trên ngưỡng Slack
   nhưng dưới ngưỡng phiên → Slack từ chối bằng chữ, autopilot **vẫn mở phiên
   được**.
7. `rig-22-brain-conflict.sh` *(giai đoạn 3)* — sửa note trên laptop và ghi từ
   Slack cùng lúc → note vào `.bee/pending/`, Slack báo, **không mất chữ nào**.

---

## 10. Ranh giới

**Luôn luôn:** luật thuần tách khỏi I/O và có test trước · allowlist so ở lớp
ngoài cùng trước khi đọc nội dung · ảnh chụp chỉ tiến sau khi Slack nhận · mọi
lượt gọi model qua `checkQuota` · token trong `slack.env` chmod 600 · thất bại
là giá trị trả về.

**Hỏi trước:** thêm dependency runtime cho `apps/slackbot` · đổi ngưỡng phanh
Slack · thêm một `kind` thông báo thứ tư · cấp thêm scope cho app Slack · đổi
hợp đồng frontmatter §4.1.

**Không bao giờ:** `systemctl` hay FIFO từ code Slack · `BRAIN_PAT` trong
`claude.env` hoặc bất cứ file nào phiên đọc được · commit `memory.db` · ghi note
từ nội dung kênh công ty · trả lời bất kỳ ai ngoài `SLACK_USER_ID` · gộp app A
và app B thành một · `git push --force` vào `bee-brain`.

---

## 11. Nghiệm thu

### Giai đoạn 1 — cái chuông

- [ ] `--dry-run` trên máy thật (11 phiên cũ) → in ra **rỗng**
- [ ] Nhịp đầu → không tin nào, `notified.json` seed đủ 11 phiên
- [ ] Thả một phiên → xong → điện thoại kêu **đúng một lần**, link mở đúng phiên
- [ ] Phiên `failed` → kêu; phiên tự `stopped` → **không** kêu
- [ ] `needs_human` bật → kêu; tắt → không kêu
- [ ] Chạy 5 nhịp sau khi đã báo → im
- [ ] Chặn mạng Slack 3 nhịp rồi mở → đúng một tin, không nhân đôi
- [ ] `systemctl --user list-timers` thấy `bee-notify.timer` đếm đúng
- [ ] `pnpm lint typecheck test build` xanh cả bốn ở `apps/slackbot`
- [ ] Rig 16–19 xanh

### Giai đoạn 2 — nghe được

- [ ] Hỏi "repo bee tuần này có gì" từ điện thoại → trả lời đúng
- [ ] Tin từ tài khoản khác → im lặng tuyệt đối, không gọi model
- [ ] Hạn mức trên ngưỡng Slack, dưới ngưỡng phiên → Slack từ chối, autopilot
      vẫn mở được phiên
- [ ] `kill -9` tiến trình → `Restart=on-failure` dựng lại, heartbeat xanh lại
- [ ] Rig 20–21 xanh

### Giai đoạn 3 — cuốn sổ

- [ ] Ghi note từ Slack → file đúng chỗ, frontmatter đủ trường §4.1, một commit
- [ ] Một tuần sau hỏi bằng từ khác hẳn → lôi ra đúng note đó
- [ ] Xoá `memory.db`, chạy lại → dựng lại đủ, không mất note nào
- [ ] `BRAIN_PAT` không xuất hiện trong môi trường của bất kỳ phiên nào
      (kiểm bằng `cat /proc/<pid>/environ` của một phiên đang chạy)
- [ ] Rig 22 xanh

### Giai đoạn 4 — kênh công ty

- [ ] **Cổng trước tiên:** workspace công ty cho tạo và cài app tự viết. Nếu
      giới hạn "chỉ app từ Marketplace" → **dừng**, ghi lại vào §12, không lách.
- [ ] Tag trong kênh → issue được tạo, link trả về trong thread
- [ ] Đồng nghiệp tag → im lặng tuyệt đối
- [ ] Test chứng minh lane công ty **không có** công cụ ghi note

---

## 12. Việc chưa quyết

- **Vector search.** `sqlite-vec` + `voyage-4-nano` (trọng số mở Apache-2.0,
  chạy local, note không rời vỏ máy). Điều kiện mở: **giai đoạn 3 cho thấy FTS5
  tìm trượt thật** — không phải khi kho đủ to. Vì markdown vẫn là nguồn sự thật,
  thêm vector sau chỉ là dựng lại index, không migrate.
- **Mem0 làm tầng recall dẫn xuất** trên markdown. Không bị loại, chỉ chưa cần.
- **`claude-mem` phía phiên** — trí nhớ của agent, hoàn toàn tách khỏi kho sổ.
- **Bản tóm tắt định kỳ** dùng lại `bee-tick.timer`, không đẻ lịch thứ hai.
- **Nút bấm trong Slack** (duyệt/merge từ điện thoại). `interactivity` đã bật
  sẵn trong manifest nên không phải cài lại app — nhưng nó chạm vào ranh giới
  §0 và cần quyết riêng.
- **Cảnh báo hạn mức** — cùng cơ chế diff, đổi file đọc sang
  `state/claude-usage.json`, chừng năm dòng. Cố ý **không** làm cùng giai đoạn 1.
