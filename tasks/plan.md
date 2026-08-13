# Plan triển khai

**Lập:** 2026-08-13 · **Sửa thứ tự:** 2026-08-13 (web trước, chạy trên fixture)
**Nguồn:** [`docs/specs/web.md`](../docs/specs/web.md) ·
[`docs/intent/pm-app.md`](../docs/intent/pm-app.md) ·
[`docs/design/reconciler.md`](../docs/design/reconciler.md) §12

---

## Thứ tự đã chốt, và vì sao nó hợp lý

Bản plan đầu đặt nghiệm thu reconciler lên trước, với lý do: dựng UI cho dữ liệu
chưa ai xác nhận là đúng thì lúc app hiện sai sẽ không biết lỗi ở đâu — debug hai
ẩn số cùng lúc.

**Quyết định làm web trước, chạy trên fixture, gỡ đúng cái lo đó.** Dữ liệu cố
định là hằng số đã biết: app hiện sai thì lỗi chắc chắn ở app. Không còn ẩn số
thứ hai.

Đổi lại có một cái giá thật, và nó nằm ở đúng một chỗ — **chỗ nối**. Nên chỗ nối
đó phải là một đường ranh rõ ràng ngay từ task đầu tiên, không phải thứ chắp vào
sau.

### Ba nhánh, và chúng độc lập tới đâu

```
A · Web trên fixture ─────────────────────────► chạy được ngay, không cần máy
                                                     │
C · Nghiệm thu reconciler (🧑, cần máy thật) ────────┤
                                                     ▼
                                            B · Nối vào dữ liệu thật
                                               (cần cả A lẫn C xong)
```

**A không phụ thuộc C.** Nhưng **B cần cả hai** — không thể nối vào một hệ thống
chưa ai xác nhận là chạy đúng.

| | Ý nghĩa |
|---|---|
| 🧑 | Chỉ người làm được — cần máy Ubuntu, GitHub repo thật, đăng nhập Claude Code |
| 🤖 | Tôi làm được |

---

## Đường ranh dữ liệu — thứ quyết định cái giá của việc làm web trước

Mọi lần đọc/ghi dữ liệu đi qua **đúng hai module**, mỗi module có hai bản cài đặt
sau cùng một interface:

```
lib/bee/      readStatus() · readRecent() · readEvidence()
              ├── fixture.ts   ← đọc từ src/lib/fixtures/
              └── disk.ts      ← đọc /srv/bee/**

lib/github/   listInbox() · getTask() · createIssue() · comment() · approve()
              ├── fixture.ts   ← dữ liệu trong bộ nhớ, ghi vào một store tạm
              └── live.ts      ← Octokit, token của người đang đăng nhập
```

Chọn bằng biến môi trường `BEE_SOURCE=fixture|disk` và `GITHUB_SOURCE=fixture|live`.

**Không component nào, không hook nào được biết đang chạy trên fixture hay dữ
liệu thật.** Nếu một `if (isFixture)` lọt vào tầng UI thì đường ranh đã hỏng, và
pha B sẽ biến thành viết lại thay vì đổi một biến môi trường.

**Fixture phải sinh từ schema thật, không phải bịa.** `status.json` lấy đúng hình
dạng mà [`bin/reconcile.sh`](../apps/reconciler/bin/reconcile.sh) `status_write()`
đang ghi; 5 cảnh đã có sẵn trong
[`docs/mockups/dashboard.html`](../docs/mockups/dashboard.html). Dữ liệu GitHub
lấy đúng hình dạng response thật của API.

### Fixture chứng minh được gì, và không chứng minh được gì

| Chứng minh được | **Không** chứng minh được |
|---|---|
| Bố cục, luồng màn hình, trạng thái rỗng/lỗi | Luồng OAuth thật chạy được |
| Logic gộp và xếp hạng hộp thư | Response GitHub thật đúng hình dạng ta giả định |
| Xử lý heartbeat cũ, JSON hỏng | Ghi thật (tạo issue, approve) thành công |
| Chặn path traversal | `status.json` thật khớp type viết tay |

Bốn dòng bên phải là **toàn bộ nội dung pha B**. Chúng không biến mất vì làm web
trước — chỉ dời lại, và đó là đánh đổi có ý thức chứ không phải rủi ro bị bỏ quên.

---

## A · Web trên fixture

Cắt dọc: mỗi task là một đường đi trọn vẹn, chạy được và kiểm được.

### W1 🤖 Bộ khung đi được

- **Làm:** scaffold Next.js 16 + Tailwind + shadcn ở `apps/web/`; ESLint
  `no-restricted-imports` chặn `@/features/*/*`; Vitest + Testing Library + MSW;
  Playwright; một trang trống.
- **AC:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` **xanh cả bốn**.
- **AC:** một test Playwright mở trang chủ và thấy tiêu đề.
- **Vì sao đứng đầu:** cổng chất lượng phải xanh *trước* khi có code để nó bảo vệ.

### W2 🤖 Đường ranh dữ liệu + fixture

- **Phụ thuộc:** W1
- **Làm:** interface `lib/bee/` và `lib/github/`, bản `fixture.ts` cho cả hai, bộ
  fixture sinh từ schema thật (5 cảnh `status.json` + issue/PR/comment mẫu).
- **AC:** type của `status.json` khớp từng trường mà `status_write()` ghi ra —
  đối chiếu tay, ghi lại trong `lib/bee/types.ts`.
- **AC:** đổi `BEE_SOURCE` không cần sửa file nào ngoài `lib/`.
- **Kiểm:** một test khẳng định fixture parse được bằng đúng type đó.

### W3 🤖 Đăng nhập trọn vẹn

- **Phụ thuộc:** W1
- **Làm:** NextAuth v5 + GitHub OAuth, allowlist theo login, `proxy.ts`, mỗi route
  handler tự kiểm session.
- **AC:** người trong allowlist → thấy tên mình. Người ngoài → đăng nhập thành công
  nhưng **không thấy dữ liệu nào**.
- **AC:** token **không** xuất hiện trong `session()` trả về client.
- **Kiểm:** Playwright cho cả hai đường; một test đọc payload session và khẳng định
  không có token.
- **Ghi chú:** luồng OAuth thật chỉ verify được ở pha B. Ở đây dùng provider giả
  trong test, và một GitHub OAuth app chế độ dev nếu bạn tạo sẵn.

### W4 🤖 Sức khoẻ hệ thống

- **Phụ thuộc:** W2, W3
- **AC:** heartbeat cũ 30 phút → **báo đỏ**. File thiếu hoặc JSON hỏng → báo rõ,
  **không crash**. Slot và hàng đợi hiện đúng.
- **Kiểm:** unit test cho cả ba trường hợp.

### W5 🤖 Hộp thư "đang chờ bạn" — màn hình chính

- **Phụ thuộc:** W2, W3
- **Làm:** 5 loại mục theo [`spec §4.1`](../docs/specs/web.md), xếp theo thời gian
  chờ giảm dần.
- **AC:** chỉ hiện mục **đang chặn người đang đăng nhập**.
- **AC:** rỗng trông như trạng thái tốt, không giống lỗi tải.
- **Kiểm:** fixture dựng đủ 5 loại, khẳng định thứ tự và nội dung.

### W6 🤖 Trang task

- **Phụ thuộc:** W5
- **AC:** issue + PR liên kết hiện thành **một trang**; dòng thời gian xen kẽ đúng
  thứ tự thật; link PR mở được sang GitHub.

### W7 🤖 Tạo task

- **Phụ thuộc:** W6
- **AC:** form ép đủ 5 mục bắt buộc của hợp đồng; submit → fixture ghi nhận một
  issue mới mang tên người tạo, gắn `status:ready-for-spec`.

### W8 🤖 Chat vào task

- **Phụ thuộc:** W6
- **AC:** gửi → comment xuất hiện trong dòng thời gian mang tên người gửi.
- **AC:** UI hiện `đã gửi · chờ tick tiếp theo` → `agent đang làm · 4m12s`.
  **Không có spinner vô tận** — nói dối về độ trễ tệ hơn độ trễ.
- **Ghi chú:** rule 02 thật cần R4.1 (pha C). Trên fixture thì mô phỏng độ trễ.

### W9 🤖 Xem bằng chứng

- **Phụ thuộc:** W6
- **AC:** video phát ngay trong trang, không tải file về.
- **AC bảo mật:** route handler từ chối path thoát ra ngoài gốc evidence — thử
  `../../etc/bee/orch.env` phải bị chặn. **Test này chạy được trên fixture và
  phải có ngay từ đầu**, vì nó là lỗ hổng chứ không phải tính năng.

### W10 🤖 PM duyệt

- **Phụ thuộc:** W6
- **AC:** bấm Duyệt → fixture ghi nhận approve mang tên PM, trạng thái đổi.
- **AC:** **không có nút merge ở bất kỳ đâu.**

### W11 🤖 Thông báo Slack

- **Phụ thuộc:** W5
- **AC:** mục mới → một tin có link mở thẳng vào task. Nhiều mục trong 5 phút →
  **gộp một tin**. Không bắn lại cho mục đã báo.
- **Kiểm:** trên fixture, khẳng định payload và logic gộp; webhook thật để pha B.

### W12 🧑 Duyệt giao diện

- **AC:** bạn bấm qua đủ 5 cảnh dữ liệu và xác nhận bố cục trước khi sang pha B.

> ## ✅ Checkpoint A — app đầy đủ, chạy trên fixture
>
> Đến đây có thể demo cho cả đội mà không cần một máy Ubuntu nào.

---

## C · Nghiệm thu reconciler (🧑 — làm song song bất cứ lúc nào)

Không chặn pha A. Nhưng **chặn pha B**, nên bắt đầu càng sớm càng tốt.

### P0 🧑 Vòng lặp đáng tin (M0)

- **P0.1** Cài lên máy Ubuntu, làm 5 việc tay installer in ra.
- **P0.2** Ba lệnh ranh giới token — cả ba phải đúng:
  ```bash
  sudo -u bee-agent env | grep -i token     # phải RỖNG
  id -nG bee-agent | grep -w docker         # phải RỖNG
  sudo -u bee-agent -n true                 # phải FAIL
  ```
- **P0.3** `be repo add` → `git --git-dir=… rev-parse origin/HEAD` in ra SHA.
  *Đây là bản vá vừa commit; hỏng thì mọi rule chết im lặng.*
- **P0.4** Kill switch cả hai tầng, gồm `.agent/PAUSE` — **tầng này chưa từng chạy**.
- **P0.5** `systemctl start bee-task@test-1` lần hai → bị từ chối; tick không chồng;
  `be dry-run` in ra mà không làm.

### P1 🧑 Rule 07 chạy thật (M1)

- **P1.1** Một task nhỏ, rõ → draft PR. PR **không chứa** `.env.test` lẫn `test-results/`.
- **P1.2** Bốn task nữa. **3/5 ra PR không can thiệp tay** = xong M1.
- **P1.3** 🤖 Sửa `prompts/build.md` theo từng lần phải can thiệp.

### P2 🧑 Phục hồi, CI, dashboard (M2)

- **P2.1** Rút điện giữa chừng → rule 01 dọn trong 1 tick; lần hai → `needs-human`.
- **P2.2** Rule 03 đẩy `bee/test`, gồm cả PR do người mở.
- **P2.3** Dashboard tĩnh **vẫn lên khi reconciler đã chết**, heartbeat cũ báo đỏ.

### R3.1 🤖 Bằng chứng sống lâu hơn worker

- **Vì sao:** bỏ MinIO, mà `test-results/` nằm trong `state/<id>/` — bị
  `claim_clear` xoá khi worker thoát. Không sửa thì bằng chứng biến mất ngay sau
  khi tạo ra.
- **Làm:** ghi vào `/srv/bee/evidence/<slug>/<num>/<sha>/`; đổi điều kiện
  `rule_scan` từ grep SHA trong PR body sang kiểm thư mục tồn tại; gỡ MinIO.
- **AC:** rig kịch bản 1 vẫn xanh; chạy lại lần hai trên cùng SHA → **không khớp nữa**.

### R3.2 🤖 Dọn `evidence/` — xoá khi PR đóng + quét theo tuổi 90 ngày

### R4.1 🤖 Rule 02 quét cả comment thường

- **AC:** comment thường có `@claude` cũng kích hoạt; **không đếm trùng** khi một
  comment xuất hiện ở cả hai API.

### P4.2 🧑 TL comment thật → agent sửa đúng chỗ nhờ `--resume`

> ## ✅ Checkpoint C — reconciler xong M0–M4

---

## B · Nối vào dữ liệu thật

**Cần cả A lẫn C.** Đây là nơi bốn dòng "fixture không chứng minh được" được trả.

### B1 🤖 `lib/bee/disk.ts`

- **AC:** đọc `/srv/bee/` thật; type viết tay khớp `status.json` thật — **mọi lệch
  đều phải sửa ở type, không phải ở component**.
- **AC:** user `bee-web` đọc được `state/<id>/` (có thể phải đặt setgid như `work/`).

### B2 🤖 `lib/github/live.ts`

- **AC:** đọc thật chạy được; mọi lệch hình dạng response sửa trong `lib/`.

### B3 🧑🤖 Ghi thật

- **AC:** tạo issue, comment, approve — cả ba **mang tên người bấm** trên GitHub.
- **AC:** `bee/approvals` chuyển xanh ở tick sau khi PM duyệt.

### B4 🧑 OAuth và Cloudflare Access thật

- **AC:** đăng nhập từ ngoài mạng nhà; người ngoài allowlist không thấy gì.

### B5 🧑 Nghiệm thu V1

- **AC:** [`docs/specs/web.md`](../docs/specs/web.md) §13 tick hết.
- **AC:** một tuần làm việc thật, **không ai mở GitHub Issues**.

---

## Rủi ro của thứ tự này

| Rủi ro | Xử lý |
|---|---|
| Fixture lệch dữ liệu thật → pha B phải sửa nhiều | W2 sinh fixture **từ schema thật**, không bịa. Lệch thì sửa trong `lib/`, không lan ra UI |
| `if (isFixture)` lọt vào tầng UI | Review từng PR cho đúng điểm này. Nếu lọt, pha B thành viết lại |
| Pha C không bao giờ bắt đầu vì web đang vui | C chặn B, mà B là chỗ app gặp người dùng thật. Web trên fixture không phải sản phẩm — nó là bản demo |
| Xây màn hình cho luồng chưa từng chạy | 5 cảnh fixture lấy từ mockup bạn đã duyệt, nên bố cục đã qua một vòng người xem |
