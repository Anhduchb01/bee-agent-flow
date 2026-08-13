# Plan triển khai

**Ngày lập:** 2026-08-13 · **Nguồn:** [`docs/specs/web.md`](../docs/specs/web.md) ·
[`docs/intent/pm-app.md`](../docs/intent/pm-app.md) ·
[`docs/design/reconciler.md`](../docs/design/reconciler.md) §12

---

## Điều quan trọng nhất trước khi đọc tiếp

**Toàn bộ reconciler chưa từng chạy trên máy thật.** 2.000 dòng bash, 4 lỗi im
lặng vừa tìm ra bằng đọc code và rig — nhưng chưa có một tick nào chạy thật, chưa
có một task nào ra PR.

Nên plan này không bắt đầu bằng viết code. Nó bắt đầu bằng **chạy thử cái đã có**.
Nếu bỏ qua và nhảy thẳng vào web app, thì lúc app hiện sai dữ liệu bạn sẽ không
phân biệt được lỗi ở app hay ở reconciler — debug hai ẩn số cùng lúc.

### Ai làm được việc gì

| | Ý nghĩa |
|---|---|
| 🧑 | **Chỉ người làm được** — cần máy Ubuntu thật, GitHub repo thật, đăng nhập Claude Code. Tôi không làm thay được |
| 🤖 | Tôi làm được — sửa code, viết test, dựng app |
| 🧑🤖 | Tôi viết, bạn chạy và báo kết quả |

Phần lớn P0–P2 là 🧑. Đó không phải thiếu sót của plan — đó là bản chất của việc
nghiệm thu một hệ thống chạy trên máy thật.

---

## Đồ thị phụ thuộc

```
P0 nghiệm thu vòng lặp  ─────────────────────────┐
   │                                             │  (mọi thứ đều chờ P0)
   ▼                                             │
P1 rule 07 chạy thật                             │
   │                                             │
   ├──────────────┬──────────────┐               │
   ▼              ▼              ▼               ▼
P2 phục hồi+CI   P3 bằng chứng  P4 feedback   P5 web app
                     │              │           │
                     └──────────────┴───────────┤
                        R3.1, R4.1 chặn W8, W7 ─┘
```

Hai chỗ nối duy nhất giữa hai nhánh:

- **W8** (xem bằng chứng) chờ **R3.1** — bằng chứng phải sống ở
  `/srv/bee/evidence/` thay vì bị `claim_clear` xoá.
- **W7** (chat vào task) chờ **R4.1** — rule 02 phải quét cả comment thường,
  không chỉ review comment trên diff.

Ngoài hai chỗ đó, web app làm song song được với việc nghiệm thu reconciler.

---

## P0 · Nghiệm thu vòng lặp (M0)

> **Cổng chặn toàn bộ plan.** Không qua P0 thì không có gì phía sau đáng tin.

### P0.1 🧑 Cài lên máy Ubuntu

- **Làm:** `sudo ~/bee-src/apps/reconciler/install.sh`, rồi 5 việc tay mà script in ra.
- **AC:** `be doctor` chạy được và in ra danh sách; không nhất thiết xanh hết ở bước này.
- **Kiểm:** `systemctl list-unit-files 'bee-*'` thấy đủ timer, service, template unit, slice.

### P0.2 🧑 Ranh giới token phải đúng — kiểm chứ đừng tin

- **Làm:** chạy đúng ba lệnh dưới.
- **AC:** cả ba ra đúng kết quả mong đợi.
  ```bash
  sudo -u bee-agent env | grep -i token     # phải RỖNG
  id -nG bee-agent | grep -w docker         # phải RỖNG
  sudo -u bee-agent -n true                 # phải FAIL
  ```
- **Vì sao đứng riêng:** nếu sai, mọi thứ vẫn chạy bình thường và bạn không có
  dấu hiệu nào. Đây là thứ phải kiểm chủ động một lần rồi để `be doctor` canh.

### P0.3 🧑 `be repo add` và bản vá `origin/HEAD`

- **Làm:** `be repo add <org>/<repo>` trên một repo thật (nên là repo nháp).
- **AC:** `git --git-dir=/srv/bee/repos/<slug>.git rev-parse origin/HEAD` in ra SHA.
- **Kiểm:** `be doctor` mục Repo hiện `<slug> → org/repo (<sha>)`, không hiện lỗi
  `origin/HEAD không phân giải được`.
- **Ghi chú:** đây là bản vá vừa commit. Nếu vẫn hỏng thì mọi rule đều chết im lặng.

### P0.4 🧑 Kill switch cả hai tầng

- **AC 1:** tạo `/etc/bee/PAUSE` → tick sau thoát im lặng, `status.json` có `mode: paused`.
- **AC 2:** tạo `.agent/PAUSE` trên `main` của repo đích qua web GitHub → tick sau
  repo đó không được quét nữa.
- **Vì sao AC 2 quan trọng:** tầng này **chưa từng hoạt động** trước bản vá P0.3.

### P0.5 🧑 Khoá, chống chồng tick, và `be dry-run`

- **AC:** `systemctl start bee-task@test-1` lần hai khi đang chạy → **bị từ chối**.
- **AC:** `journalctl -u bee-reconcile -n 50` — tick đều 30 giây, không chồng nhau,
  mỗi tick dưới 5 giây.
- **AC:** `be dry-run` in ra nó *định* làm gì mà không làm gì.

> ## ✅ Checkpoint 0 — dừng lại, đọc lại
>
> Chỉ đi tiếp khi cả 5 mục trên đúng. Đây là mốc quan trọng nhất trong toàn bộ dự
> án; mọi thứ sau đây đều giả định vòng lặp đáng tin.

---

## P1 · Rule 07 chạy thật (M1)

### P1.1 🧑 Một task nhỏ, rõ, đi hết đường

- **Làm:** tạo issue theo template 5 mục cho một việc nhỏ và rõ (CRUD, một form,
  một bug đã tái hiện được). Gắn `agent:eligible` + `agent:build`.
- **AC:** agent nhận, tạo worktree, commit, push, mở draft PR, comment tổng kết.
- **Kiểm:** PR không chứa `.env.test` lẫn `test-results/` — bản vá C2/C3 phải có tác dụng.
- **Kiểm:** comment tổng kết có mục **Không chắc** không rỗng.

### P1.2 🧑 Bốn task nữa

- **AC:** **3/5 task ra PR không cần can thiệp tay.** Đây là tiêu chí xong M1.
- **Kiểm:** ghi lại task nào cần can thiệp và vì sao — đây là dữ liệu để sửa prompt.

### P1.3 🤖 Sửa prompt theo những gì P1.2 học được

- **Phụ thuộc:** P1.2
- **AC:** mỗi lần can thiệp tay ở P1.2 ứng với một thay đổi cụ thể trong
  `prompts/build.md`, hoặc một lý do rõ ràng tại sao không sửa prompt.

> ## ✅ Checkpoint 1 — agent làm được việc thật
>
> Từ đây web app mới có dữ liệu thật để hiển thị.

---

## P2 · Phục hồi, CI, dashboard (M2)

### P2.1 🧑 Rút điện giữa lúc agent chạy

- **AC:** bật lại → rule 01 dọn trong 1 tick, worktree bị xoá, issue quay về `agent:build`.
- **AC:** làm lần thứ hai trên cùng issue → gắn `needs-human`, không thử lần ba.

### P2.2 🧑 Rule 03 — CI trên phần cứng của mình

- **Điều kiện:** repo đích có `scripts/ci.sh`.
- **AC:** PR hiện commit status `bee/test` xanh, và **áp dụng cả cho PR do người mở**.

### P2.3 🧑🤖 Dashboard lên được

- **Làm:** trỏ một web server tĩnh vào `/srv/bee/public/`.
- **AC:** mở `http://localhost:8787` thấy đúng slot, hàng đợi, heartbeat.
- **AC quan trọng nhất:** `systemctl stop bee-reconcile.timer` 15 phút → **trang
  vẫn lên** và hiện banner đỏ "reconciler có thể đã chết".

---

## P3 · Bằng chứng (M3)

### R3.1 🤖 Chuyển bằng chứng sang chỗ sống lâu hơn worker

- **Vì sao:** intent chốt bỏ MinIO, mà `test-results/` hiện nằm trong `state/<id>/`
  — bị `claim_clear` xoá khi worker thoát. Không sửa thì bằng chứng biến mất ngay
  sau khi tạo ra.
- **Làm:**
  - Ghi vào `/srv/bee/evidence/<slug>/<num>/<sha>/`
  - Đổi điều kiện `rule_scan`: thay vì grep SHA trong PR body → kiểm thư mục đó tồn tại
  - Bỏ phụ thuộc MinIO khỏi rule 04; `publish-evidence.sh` chỉ còn nhiệm vụ chuyển
    webm → mp4/gif và dựng `evidence.md`
- **AC:** rig kịch bản 1 vẫn xanh, và chạy lại rule 04 lần hai trên cùng SHA →
  **không khớp nữa** (không lặp vô hạn).
- **Kiểm:** thêm kịch bản rig cho đúng điều đó.
- **Chặn:** W8

### R3.2 🤖 Chính sách dọn `evidence/`

- **AC:** xoá khi PR đóng, cộng một lượt quét theo tuổi (90 ngày).
- **Kiểm:** đơn vị nhỏ — tạo thư mục giả với `mtime` cũ, chạy hàm dọn, xác nhận biến mất.

### P3.3 🧑 Chạy thật một vòng bằng chứng

- **AC:** PM mở PR, xem GIF chạy inline, tick đủ AC rồi Approve — **không cần hỏi
  ai câu nào và không cần preview env**.

---

## P4 · Vòng feedback (M4)

### R4.1 🤖 Rule 02 quét cả comment thường

- **Vì sao:** app post comment thường lên PR (`issues/{n}/comments`), còn rule 02
  hiện chỉ quét review comment trên diff (`pulls/{n}/comments`).
- **AC:** comment thường có `@claude` cũng kích hoạt rule 02.
- **AC:** không đếm trùng khi một comment xuất hiện ở cả hai API.
- **Kiểm:** rig — stub cả hai endpoint, xác nhận số đếm đúng.
- **Chặn:** W7

### P4.2 🧑 Techlead comment thật

- **AC:** TL comment `@claude` trên diff → agent sửa đúng chỗ, **không cần giải
  thích lại bối cảnh** (nhờ `--resume`).

> ## ✅ Checkpoint 2 — reconciler xong M0–M4
>
> Đến đây bee đã tự chạy được vòng đời đầy đủ. Web app từ giờ chỉ là mặt người
> dùng, không phải chỗ vá lỗi cho máy.

---

## P5 · Web app V1

Cắt dọc: mỗi task là **một đường đi trọn vẹn**, chạy được và kiểm được, không phải
một tầng.

### W1 🤖 Bộ khung đi được

- **Làm:** scaffold Next.js 16 + Tailwind + shadcn ở `apps/web/`, một trang trống,
  ESLint `no-restricted-imports` cho barrel, Vitest + MSW + Playwright.
- **AC:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` **xanh cả bốn**.
- **AC:** một test Playwright mở trang chủ và thấy tiêu đề.
- **Vì sao đứng đầu:** cổng chất lượng phải xanh *trước* khi có code để nó bảo vệ.

### W2 🤖 Đăng nhập trọn vẹn

- **Phụ thuộc:** W1
- **Làm:** NextAuth v5 + GitHub OAuth, allowlist theo login, `proxy.ts`, route
  handler tự kiểm session.
- **AC:** người trong allowlist đăng nhập → thấy tên mình. Người ngoài allowlist
  **đăng nhập thành công nhưng không thấy dữ liệu nào**.
- **AC:** token **không** xuất hiện trong `session()` trả về client.
- **Kiểm:** Playwright cho cả hai đường; một test đọc payload session và khẳng
  định không có token.

### W3 🤖 Đọc `status.json` + trạng thái cũ

- **Phụ thuộc:** W2
- **Làm:** `lib/bee/` server-only, type viết tay, một dải "sức khoẻ hệ thống".
- **AC:** heartbeat cũ 30 phút → **báo đỏ**. File thiếu hoặc JSON hỏng → báo rõ,
  **không crash**.
- **Kiểm:** unit test cho cả ba trường hợp (bình thường, cũ, hỏng).

### W4 🤖 Hộp thư "đang chờ bạn" — màn hình chính

- **Phụ thuộc:** W2, W3
- **Làm:** gộp GitHub API + `status.json`, 5 loại mục theo spec §4.1, xếp theo thời
  gian chờ giảm dần.
- **AC:** chỉ hiện mục **đang chặn người đang đăng nhập**.
- **AC:** rỗng trông như trạng thái tốt, không giống lỗi tải.
- **Kiểm:** MSW dựng 5 loại mục, khẳng định thứ tự và nội dung.

### W5 🤖 Trang task

- **Phụ thuộc:** W4
- **AC:** issue + PR liên kết hiện thành **một trang**; dòng thời gian xen kẽ đúng
  thứ tự thật; link PR mở được sang GitHub.

### W6 🤖 Tạo task

- **Phụ thuộc:** W5
- **AC:** form ép đủ 5 mục bắt buộc; submit → issue trên GitHub **mang tên người
  tạo**, gắn `status:ready-for-spec`.
- **AC:** tick sau, comment của rule 08 xuất hiện trong dòng thời gian **không cần
  tải lại trang**.

### W7 🤖 Chat vào task

- **Phụ thuộc:** W5, **R4.1**
- **AC:** gửi → comment lên GitHub mang tên người gửi; UI hiện
  `đã gửi · chờ tick tiếp theo` → `agent đang làm · 4m12s`.
- **AC:** **không có spinner vô tận.** Nói dối về độ trễ tệ hơn độ trễ.

### W8 🤖 Xem bằng chứng

- **Phụ thuộc:** W5, **R3.1**
- **AC:** video phát ngay trong trang, không tải file về.
- **AC bảo mật:** route handler từ chối path thoát ra ngoài gốc evidence — thử
  `../../etc/bee/orch.env` phải bị chặn.
- **Kiểm:** test cho đúng đường tấn công đó.

### W9 🤖 PM duyệt

- **Phụ thuộc:** W5
- **AC:** bấm Duyệt → GitHub ghi nhận approve **mang tên PM**; `bee/approvals`
  chuyển xanh ở tick sau.
- **AC:** không có nút merge ở bất kỳ đâu.

### W10 🤖 Thông báo Slack

- **Phụ thuộc:** W4
- **AC:** mục mới vào hộp thư → một tin Slack có link mở thẳng vào task.
- **AC:** nhiều mục trong 5 phút → **gộp một tin**, không spam.
- **AC:** không bắn lại cho mục đã báo.

### W11 🧑 Nghiệm thu V1

- **AC:** toàn bộ [`docs/specs/web.md`](../docs/specs/web.md) §13 tick hết.
- **AC:** một tuần làm việc thật, **không ai mở GitHub Issues**.

---

## Ước lượng và rủi ro

| Pha | Khối lượng | Rủi ro lớn nhất |
|---|---|---|
| P0 | nửa ngày 🧑 | Một trong ba ranh giới token sai → phải sửa lại install.sh |
| P1 | 1–2 ngày 🧑 | Prompt chưa đủ tốt; đây chính là mục đích của mốc |
| P2 | nửa ngày | — |
| P3 | 1 ngày | `publish-evidence.sh` vốn viết cho MinIO, gỡ ra có thể lộ giả định khác |
| P4 | nửa ngày | Đếm trùng comment giữa hai API |
| P5 | 5–8 ngày | W2 (OAuth) và W4 (hộp thư) là hai chỗ dễ trượt nhất |

**Rủi ro không nằm trong bảng:** P0–P2 phụ thuộc hoàn toàn vào việc bạn có thời
gian ngồi trước máy. Nếu không, plan này đứng yên bất kể tôi viết nhanh đến đâu —
và làm P5 trước sẽ tạo ra một app hiển thị dữ liệu chưa ai xác nhận là đúng.
