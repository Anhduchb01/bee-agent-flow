# bee-agent-flow — Product Requirements Document (PRD)

> Bản 3.0 sinh ra từ lượt review + tranh luận ngày 17/08/2026, thay thế bản 2.0
> (giữ nguyên văn ở nhánh `feat/bee-m3-and-web-spec`, commit `5b51dab`).
> Bản 3.1 (22/08) ghi nhận hai quyết định đã chạy thật: bỏ cửa phỏng vấn,
> thay bằng **mode per-phiên** (19/08); Tailscale thay Cloudflare Access (20/08).
> Bản 3.2 (24/08) thêm ba thứ ô chat đã có: **model theo phiên**, **đính kèm
> file**, và **ngữ cảnh nhìn thấy được** (vòng % + đường may compact).
> Khi ba thứ mâu thuẫn: **PRD thắng về *muốn gì*, spec thắng về *làm thế nào*,
> code thắng về *hôm nay đang là gì*.**

| | |
| --- | --- |
| **Trạng thái** | Đang hiệu lực — V1 + V2 đã nghiệm thu trên máy thật |
| **Phiên bản** | 3.2 — session-first, mô hình một UID ("A+"), mode + model per-phiên |
| **Người tạo (Product Owner)** | Đức |
| **Team tham gia** | Một người |
| **Ngày cập nhật cuối** | 24/08/2026 |

---

## 0. Vì sao có bản 3.0 — và quyết định đắt nhất của nó

Bản 2.0 đã nhìn đúng sản phẩm: *coi agent như người đang làm việc cùng, không
phải cỗ máy nuốt issue*. Nhưng nó vẫn kéo theo toàn bộ bộ máy của mô hình cũ —
hai UID, cầu socket, broker, sudoers, hàng đợi nhãn — để phục vụ một mô hình đe
doạ **không khớp với thực tế sử dụng**: một người dùng, repo toàn private, máy
chuyên dụng không chứa gì khác.

Bản 3.0 định nghĩa lại sản phẩm bằng một câu:

> **Một con máy thứ hai chạy Claude Code — nhưng treo 24/7, mở được từ mọi nơi
> kể cả điện thoại, quản lý được n phiên theo từng repo, và tự nhặt việc khi
> mình đi ngủ.**

### 0.1 Quyết định kiến trúc: A+ thay vì C — và cái giá đã chấp nhận

Hai phương án đã được cân đầy đủ:

| | **C — hai UID + broker** | **A+ — một UID, có vệ sinh (CHỐT)** |
|---|---|---|
| Agent cầm credential | Không — mọi việc cần token đi qua broker allowlist | Có — `gh` trực tiếp, nhưng là **fine-grained PAT phạm vi hẹp** |
| Ranh giới cách ly | UID, do kernel giữ | **Cả cái máy** — máy chuyên dụng không chứa gì đáng lấy |
| Chi phí | Thuế năng lực đóng mãi: mỗi quyền mới = sửa broker; thêm một họ hỏng-im-lặng | Một buổi làm checklist vệ sinh, một lần |
| Injection tệ nhất | Vài artifact rác trong repo của mình | **Code private bị đọc trộm** + đốt quota + phải cài lại máy |

Chốt **A+** vì: (1) tài sản cần bảo vệ nằm trên GitHub, không nằm trên máy —
nên **branch protection + PAT phạm vi hẹp** thay được phần lớn việc của hàng
rào UID; (2) kịch bản xấu nhất khôi phục được trong một buổi tối (revoke token,
đăng nhập lại, cài lại máy); (3) với team một người, thuế năng lực của C là
loại ma sát giết dần sản phẩm.

**Cái giá được chấp nhận có ý thức:** nếu agent bị chiếm (chủ yếu qua supply
chain npm — repo private không chặn được đường này), code private có thể bị
đọc. Với dự án cá nhân, thiệt hại đó là chấp nhận được. Điều **không** chấp
nhận là "A cẩu thả" — checklist §4.2 là điều kiện tiên quyết, không phải khuyến nghị.

### 0.2 Cò súng bắt buộc chuyển sang C

Bảng này là một phần của hợp đồng. Bất kỳ dòng nào thành sự thật → dừng nhận
việc mới, chuyển sang mô hình C (hạ tầng hai UID vẫn nằm ở nhánh
`feat/bee-m3-and-web-spec` và `apps/reconciler/`, đã nghiệm thu M0):

1. Repo nào đó chuyển **public** (comment công khai = kênh injection mở lại).
2. Có **người thứ hai** dùng thật.
3. Bật lại tính năng đọc comment PR từ người ngoài.
4. Máy bắt đầu chứa **secret khác** (deploy key, API key production, SSH key).
5. Làm code cho khách / có nghĩa vụ bảo mật.

---

## 1. Tổng quan

### 1.1 Vấn đề và Mục tiêu

- **Cho ai:** một người — nghĩ ra việc, giao việc, duyệt kết quả. Vài giờ mỗi
  ngày trước máy; phần còn lại là điện thoại.
- **Muốn:** giao việc bằng cách nói, xem agent làm live, hoặc thả việc rồi đi
  ngủ. Từ bất cứ đâu.
- **Sợ:** agent chạy sai cả đêm không ai biết; hạn mức cháy lúc 1 giờ sáng;
  phiên chết mà UI vẫn quay.
- **Nút thắt thật:** không phải máy, không phải model — là **mặt điều khiển**.
  Claude Code trên laptop chết khi gập máy; CI thì không tương tác được. Không
  cái nào cho *vừa live vừa bền vừa mở từ điện thoại*.

**Mục tiêu:** một web app quản lý **n phiên Claude Code, nhóm theo repo**, mỗi
phiên: xem live, gõ chen, dừng, nối lại. Issue/PR/push là việc agent tự làm
bằng skill — không phải choreography của app.

### 1.2 Tiêu chí Thành công

| # | Thước đo | Ngưỡng |
|---|---|---|
| S1 | Sáng dậy có việc đã xong đang chờ xem | n > 0, đều đặn trong một tuần |
| S2 | Giao việc từ điện thoại — không ssh, không laptop | 100% các lần thử |
| S3 | Số lần mở terminal để cứu một phiên chết | **0** |
| S4 | Duyệt một kết quả trên điện thoại | < 1 phút |
| S5 | Đêm tự chạy kết thúc vì *hết việc*, không phải *hết hạn mức giữa chừng* | ≥ 80% số đêm |

---

## 2. Người dùng và Luồng

### 2.1 Persona

Một persona duy nhất: **chủ dự án**. Không PM, không Techlead, không phân vai.

### 2.2 User Stories

- **US-01** — Nói một câu ý tưởng, được hỏi lại tới khi thành task rõ ràng.
- **US-02** — Nói "ok làm đi" ngay trong hội thoại, agent bắt đầu ngay.
- **US-03** — Nhìn agent làm theo thời gian thực: đọc file nào, sửa gì, chạy gì.
- **US-04** — Dừng một phiên đang đi sai, ngay lập tức.
- **US-05** — Thả một xấp việc trước khi ngủ, kèm ngân sách hạn mức.
- **US-06** — Duyệt một kết quả < 1 phút trên điện thoại, bấm merge tại chỗ.
- **US-07** — Thấy hạn mức còn bao nhiêu; agent dừng gọn trước khi cạn.
- **US-08** — Mở nhiều phiên song song trên cùng một repo mà không giẫm chân nhau.
- **US-09** — Nối lại phiên cũ để hỏi "vì sao bạn làm thế".

### 2.3 Luồng chính

```
Mở app → chọn repo → New session (chọn mode, mặc định Auto)
  → phiên là chat có ĐỦ TOOL TỪ TIN NHẮN ĐẦU — nói ý tưởng, agent hỏi lại
    nếu chưa rõ, "ok làm đi" chỉ là một câu trong hội thoại
  → muốn khảo sát trước thì mở ở mode Plan, đổi sang Auto ngay giữa chat
  → agent: sửa code trong worktree, commit, tự push, tự mở PR (skill)
  → xong: link PR trong dòng sự kiện → xem → merge (V2)
```

> **Đã đổi 19/08:** bản 3.0 đặt một "cửa chặn" phỏng vấn (không tool) → "ok
> làm đi" (đủ tool). Cửa đó đã bỏ — thứ thay thế là **mode per-phiên**
> (FR-1.6): quyền của agent do mode quyết, không do một màn chuyển chế độ.

**Luồng phụ — đi ngủ (V3):** chọn n việc → đặt ngân sách → app lần lượt mở
phiên cho từng việc, tự dọn phiên chết, tự phanh trước khi cạn hạn mức → sáng
dậy đọc bản tin.

---

## 3. Yêu cầu Chức năng

> **P0** (Must) · **P1** (Should) · **P2** (Nice to have)

### Epic 1: Phiên là đối tượng gốc

| ID | Tính năng | Tiêu chí nghiệm thu | Ưu tiên |
|---|---|---|---|
| FR-1.1 | Danh sách phiên, nhóm theo repo | Thấy mọi phiên: đang chạy / xong / chết. Mở lại được phiên cũ | **P0** |
| FR-1.2 | Tạo phiên mới trên một repo | Mỗi phiên một worktree + một branch riêng — n phiên trên một repo không giẫm nhau | **P0** |
| FR-1.3 | Xem live | Chữ chạy < 5s (tính từ sự kiện vòng đời đầu tiên, không phải token model). Đóng trình duyệt 10 phút, mở lại: phiên vẫn chạy, xem tiếp từ chỗ đang tới | **P0** |
| FR-1.4 | Gõ chen giữa chừng | Câu của mình vào dòng sự kiện ngay, agent tiếp thu | **P0** |
| FR-1.5 | Dừng | Dừng < 5s, worktree dọn được, không rác | **P0** |
| FR-1.6 | Mode per-phiên *(thay "phỏng vấn → ok làm đi", 19/08)* | 4 mode như menu Claude Code trong VSCode: **Auto** (mặc định, `--dangerously-skip-permissions` — hàng rào nằm ở A+ §4.2, không ở hộp thoại) · **Plan** (chỉ đọc) · **Edits** (sửa file tự do, tool khác hỏi) · **Manual** (mọi tool hỏi, thẻ Allow/Deny bấm được từ điện thoại). Chọn lúc tạo, **đổi ngay giữa chat** — cùng phiên, cùng hội thoại (`--resume`) | **P0** |
| FR-1.7 | Bền qua mọi restart | `systemctl restart bee-web` / đóng trình duyệt / mất mạng: phiên không hề hấn | **P0** |
| FR-1.8 | Nối lại phiên đã xong để hỏi | `--resume` đúng phiên, trả lời trong vài giây | P1 |
| FR-1.9 | Chọn model cho từng phiên *(thêm 24/08)* | Việc nhẹ giao model nhanh, việc khó giao model mạnh — chọn lúc tạo, đổi giữa chat, cùng hội thoại. Không chọn = để máy tự quyết | P1 |
| FR-1.10 | Đính kèm ảnh/file từ điện thoại *(thêm 23/08)* | Chụp màn hình bug → đính vào phiên → agent đọc được file, không phải mô tả bằng lời | P1 |

### Epic 2: Agent tự làm việc GitHub bằng skill

| ID | Tính năng | Tiêu chí nghiệm thu | Ưu tiên |
|---|---|---|---|
| FR-2.1 | Agent tạo issue / PR / push trực tiếp (`gh`, PAT hẹp) | Từ hội thoại → issue/PR xuất hiện trên GitHub, không cần app làm hộ | **P0** |
| FR-2.2 | Quy ước branch `bee/<slug>-<n>` | Mỗi phiên một branch; agent không push branch khác (quy ước + review) | **P0** |
| FR-2.3 | `main` được branch protection | Push thẳng main bị GitHub từ chối — **với mọi token**. Đường duy nhất vào main là nút merge người bấm | **P0** — điều kiện tiên quyết |
| FR-2.4 | Hành động của NGƯỜI mang tên người | Merge, approve, comment từ UI dùng token OAuth của người bấm. Artifact agent tạo mang danh bot — trung thực với lịch sử | **P0** |

### Epic 3: Hạn mức là tài nguyên hạng nhất *(giữ nguyên từ 2.0)*

| ID | Tính năng | Ưu tiên |
|---|---|---|
| FR-3.1 | Nhìn thấy hạn mức ở mọi màn | **P0** |
| FR-3.2 | Quy hạn mức về từng phiên (`usage`/`stop_reason` mỗi lần chạy) | **P0** — *đã có* |
| FR-3.3 | Phanh trước khi cạn: dưới ngưỡng → không mở phiên mới | **P0** (V3) |
| FR-3.4 | Trần chi cho một phiên → dừng và hỏi người | P1 (V3) |

### Epic 4: Duyệt trong một phút *(V2, giữ nguyên từ 2.0)*

FR-4.1 màn duyệt cho điện thoại · FR-4.2 **nút merge trong app** (token người
bấm) · FR-4.3 tóm tắt "đã đổi gì" · FR-4.4 diff thì link sang GitHub, không làm.

### Epic 5: Tự chạy đêm *(V3)*

| ID | Tính năng | Ưu tiên |
|---|---|---|
| FR-5.1 | Hàng đợi do app sở hữu — chọn việc, xếp thứ tự, máy tắt không mất | **P0** (V3) |
| FR-5.2 | Tự nhặt issue: đánh dấu issue → app tự mở phiên khi tới lượt | P1 (V3) |
| FR-5.3 | Bản tin buổi sáng: chạy gì, xong gì, kẹt gì, **vì sao** — câu đọc được, không phải mã lỗi | P1 (V3) |
| FR-5.4 | Mở khoá dần theo repo: hỏi trước mọi thứ → tự chạy trong ranh giới → tự chạy hết | P1 (V3) |

### Epic 6: Nền chạy bền *(thừa kế từ bee, thu nhỏ)*

| ID | Tính năng | Ưu tiên |
|---|---|---|
| FR-6.1 | Phiên là systemd unit — sống ngoài web, khoá trùng miễn phí | **P0** |
| FR-6.2 | Reaper: phiên chết (`kill -9`, mất điện) → phát hiện và đóng sổ trong một tick; hai lần liên tiếp → cờ cần người | **P0** |
| FR-6.3 | Heartbeat: hệ nền chết im lặng → app báo đỏ, không giấu | **P0** |
| FR-6.4 | Kill switch: một file PAUSE → không mở phiên mới | **P0** |
| FR-6.5 | Vào từ mọi nơi: Tailscale ở rìa (chốt 20/08, thay Cloudflare Access) + GitHub OAuth allowlist | **P0** |
| FR-6.6 | Điện thoại là hạng nhất | **P0** |

---

## 4. Yêu cầu Phi chức năng

### 4.1 Chất lượng cảm nhận

- Sự kiện đầu tiên của phiên < 5 giây. Trạng thái chờ nói rõ đang chờ *cái gì*.
  **Không spinner vô tận** — nói dối về độ trễ tệ hơn độ trễ.
- Dữ liệu cũ hiển thị **là** cũ. Rỗng-vì-hết-việc ≠ rỗng-vì-lỗi.
- **Ngữ cảnh không được là hộp đen** *(thêm 24/08)*: thấy cửa sổ còn bao nhiêu
  (vòng % kèm số thô — "10%" một mình là vô nghĩa khi cửa sổ 1M), và khi hội
  thoại bị nén thì **thấy chỗ nó bị nén**. Vòng tụt đột ngột mà không nói lý
  do là một cách nói dối về trạng thái.
- Đầu ra agent render **plain text** ở V1 — nội dung untrusted, muốn markdown
  đẹp thì V2 kèm sanitizer có test.
- **Thiết kế: Geist (Vercel), dark là mặc định** *(đổi 17/08 — theo Claude
  Code trong VSCode)*: class `dark` ở root layout, token sáng giữ nguyên làm
  đường lùi. Màn chat theo ngôn ngữ hình ảnh panel VSCode — thẻ tool "● tên +
  tóm tắt mờ", diff đỏ/xanh cho Edit/Write, khối IN/OUT cho Bash, ô nhập bo
  tròn với nút gửi ↑ màu đất nung (#C15F3C). Chi tiết ở spec
  [session-first §4.4](specs/session-first.md).

### 4.2 Bảo mật — checklist vệ sinh A+ (điều kiện tiên quyết, `doctor` kiểm)

Mode mặc định của phiên là Auto — agent chạy `--dangerously-skip-permissions`
(FR-1.6). Điều đó chấp nhận được *chỉ khi* checklist dưới đây đúng toàn bộ;
muốn hàng rào per-tool thì chọn mode Plan/Edits/Manual cho phiên đó.

1. **Máy chuyên dụng đúng nghĩa:** không SSH key sang máy khác, không password
   manager, không secret nào ngoài PAT + login Claude. `.env` production không
   bao giờ nằm trên máy này và không bao giờ commit trong repo.
2. **Fine-grained PAT:** chỉ các repo làm việc; quyền contents + pull-requests
   + issues. Không bao giờ dùng token tài khoản đầy đủ.
3. **Branch protection `main`** trên từng repo: cấm push trực tiếp, bắt buộc PR.
4. **Tailscale + OAuth allowlist** — web chỉ bind localhost, `tailscale
   serve` proxy HTTPS cho riêng tailnet (không cổng nào mở ra internet
   công cộng); người ngoài allowlist đăng nhập được nhưng không thấy gì.
5. **Xem lại mỗi sáng:** billing Claude + audit log GitHub (bản tin V3 kiêm luôn).

Web app vẫn giữ kỷ luật cũ, vì chúng rẻ và đúng bất kể mô hình: mọi route tự
kiểm session (không tin proxy — CVE-2025-29927) · chặn path traversal ở route
đọc file · token OAuth của người trong cookie httpOnly mã hoá.

### 4.3 Bền bỉ

Trạng thái sống trên đĩa, không sống trong RAM tiến trình nào — nguyên tắc này
**giữ nguyên từ mô hình cũ** vì nó chưa bao giờ thuộc về bảo mật: đóng trình
duyệt / restart web / `kill -9` đều không mất phiên; mỗi kiểu hỏng có đúng một
cơ chế bắt.

---

## 5. Kiến trúc mục tiêu

```
Trình duyệt (kể cả điện thoại)
   │  HTTPS qua Tailscale (tailnet riêng) + GitHub OAuth (allowlist)
   ▼
bee-web ──────────────── cùng UID `bee` ──────────────── phiên agent
   │  systemctl --user start bee-session@<id>   ← không sudo, không socket, không cầu
   │  ghi sessions/<id>/session.json            ← tham số phiên
   │  tail  sessions/<id>/run.jsonl → SSE       ← đường ra, bền, trên đĩa
   │  ghi   FIFO <id>.in                        ← đường vào, tương tác
   ▼
bee-session@<id>  (systemd user unit, linger)
   └─ session-run.sh: fetch → branch bee/<slug>-<n> → worktree
        → claude stream-json vào/ra → run.jsonl
        → agent tự gh issue/pr/push (PAT hẹp; main có branch protection)

nền: bee-reaper.timer (dọn xác) · bee-heartbeat.timer · PAUSE
```

**Ba thứ biến mất so với 2.0, và đó là chủ ý:** không cầu socket qua UID,
không broker/spool, không sudoers. Chúng tồn tại chỉ để vượt ranh giới UID —
ranh giới đã chuyển ra vỏ máy + GitHub.

**Giữ nguyên, không đàm phán:** trạng thái trên đĩa · phiên là systemd unit ·
worktree per phiên · reaper + heartbeat + PAUSE · mọi hành động của người mang
tên người · `usage`/`stop_reason` mỗi lần chạy.

---

## 6. Kế hoạch Triển khai

### 6.1 Lộ trình

| Phase | Gồm | Xong nghĩa là |
|---|---|---|
| **V1 — Sessions live** | Epic 1 + Epic 2 + FR-6.1→6.6 | Nói → "ok làm đi" → nhìn agent làm → PR. Từ điện thoại, ngoài mạng nhà |
| **V2 — Duyệt & merge** | Epic 4 + FR-3.1 | Vòng đời khép kín trong app: giao → xem → merge |
| **V3 — Đi ngủ** | Epic 5 + FR-3.3/3.4 | Thả một xấp việc, sáng dậy có kết quả + bản tin |
| **V4 — Dọn nợ** | Xoá đường cũ (hàng đợi nhãn, cầu socket, hộp thư 5 loại), đồng bộ tài liệu | Một mô hình duy nhất trong repo |

### 6.2 Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Supply chain npm chiếm agent → đọc code private | **Cao** | Chấp nhận có ý thức (§0.1) + checklist §4.2 + cò súng §0.2. PAT hẹp chặn lan sang ngoài |
| A+ trôi thành A cẩu thả | **Cao** | `doctor` kiểm checklist §4.2 mỗi lần chạy, fail là báo đỏ trên app |
| Hạn mức cháy trong đêm | Cao | FR-3.3 là P0 của V3; V1 chưa tự chạy nên chưa lộ |
| Hai mô hình cùng tồn tại trong repo | Trung bình | Nhánh này chỉ build mô hình mới; nhánh cũ đóng băng làm fallback; V4 xoá dứt điểm |
| ~~Gõ chen lúc agent giữa tool call — CLI xử lý thế nào chưa rõ~~ | ~~Trung bình~~ | **Đã gỡ (rig S0.1, 17/08):** CLI xếp hàng và tiếp thu. Kèm phát hiện: input không được echo → spec thêm `bee_user_say`. Xem [rig/FINDINGS.md](../apps/runner/rig/FINDINGS.md) |

---

## 7. Khoảng cách với repo hiện tại

> **Ảnh chụp lịch sử** — đối chiếu tại `5b51dab` (17/08/2026), giữ nguyên làm
> bằng chứng cho quyết định 3.0. Hiện trạng sống xem bảng "Đã dựng tới đâu"
> trong [architecture.html](architecture.html): mục §7.3 dưới đây đã xây xong
> gần hết (V1+V2 nghiệm thu 20–21/08). Nhánh `feat/bee-m3-and-web-spec` giữ
> nguyên toàn bộ mô hình cũ làm fallback.

### 7.1 Giữ — dùng lại gần như nguyên

| Thứ | Ở đâu |
|---|---|
| Mẫu chạy claude stream-json + `usage`/`stop_reason` | `apps/reconciler/bin/agent-exec.sh` · `lib/` |
| Vòng đời worktree, logic dọn xác (rule 01), heartbeat | `apps/reconciler/` — port sang runner mới |
| Web: 15 feature slice, SSE/live design, evidence viewer, chặn traversal | `apps/web/` |
| Tạo task bằng phỏng vấn (UI) | `create-task-dialog.tsx` — *(hậu trường "phiên hai chế độ" đã bỏ 19/08, thay bằng mode per-phiên — FR-1.6)* |
| Thiết kế đường ra/đường vào (run.jsonl + FIFO) của spec v1-live | `docs/specs/v1-live.md` §3 — chuyển nguyên vào spec mới |

### 7.2 Không dùng trong mô hình mới (đóng băng, xoá ở V4)

Cầu socket `spec-chat` + sudoers + polkit hai UID · rule 07 (hàng đợi nhãn) ·
rule 08 (spec) · hộp thư 5 loại suy từ nhãn · orch/agent tách user.
· hộp thư + notify + chat cũ đã XOÁ 18/08 (đợt 1+2), làm lại trên runner phiên

### 7.3 Thiếu — phải xây

Runner mới (`bee-session@` user unit + session-run.sh) · màn session manager
(n phiên theo repo) · chuyển chế độ phỏng vấn→làm trong một phiên · skills
issue/PR/push · doctor checklist A+ · OAuth thật + Tailscale ở rìa.

**Đã xong (17/08):** S0 — hai ẩn số gỡ bằng rig, cả hai thuận
([rig/FINDINGS.md](../apps/runner/rig/FINDINGS.md)); 3 fixture `run.jsonl`
thật sẵn cho phần web.

---

## 8. Phụ lục

**Thuật ngữ**

| | |
|---|---|
| **A+** | Mô hình một UID có vệ sinh: ranh giới = vỏ máy + hàng rào GitHub-side |
| **Phiên (session)** | Đối tượng gốc: một lần Claude Code chạy trong một worktree, sống như systemd unit |
| **Mode per-phiên** | Mức quyền của một phiên: Auto / Plan / Edits / Manual — chọn lúc tạo, đổi giữa chat (FR-1.6). Thay khái niệm "chuyển chế độ phỏng vấn → làm" của bản 3.0, bỏ 19/08 |
| **Reaper** | Kẻ dọn xác phiên — hậu duệ trực tiếp của rule 01 |
| **Cò súng** | Điều kiện §0.2 buộc chuyển sang mô hình C |

**Tài liệu liên quan**

- [docs/specs/session-first.md](specs/session-first.md) — spec V1 của mô hình này
- [docs/specs/v1-live.md](specs/v1-live.md) — spec mô hình cũ *(đóng băng, còn giá trị ở §3)*
- [docs/architecture.html](architecture.html) — tài liệu kiến trúc **hiện hành** của mô hình session-first *(từ f3e2d61; bản đồ hai UID cũ nằm ở nhánh fallback)*
- [AGENTS.md](../AGENTS.md) — quy ước code
