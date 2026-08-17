# bee-agent-flow — Product Requirements Document (PRD)

> Sinh ra từ một lượt phỏng vấn (`interview-me`) ngày 2026-08-17, thay thế
> [`docs/intent/pm-app.md`](intent/pm-app.md) (13/08) làm nguồn ý định.
> Khi ba thứ mâu thuẫn: **PRD thắng về *muốn gì*, spec thắng về *làm thế nào*,
> code thắng về *hôm nay đang là gì*.**

| | |
| --- | --- |
| **Trạng thái** | In Review |
| **Phiên bản** | 2.0 — viết lại mô hình sản phẩm |
| **Người tạo (Product Owner)** | Đức |
| **Team tham gia** | Một người. Đôi khi thêm một người nữa |
| **Ngày cập nhật cuối** | 17/08/2026 |

---

## 0. Vì sao có bản 2.0 — và bản 1 sai ở đâu

Bản 1 ([`intent/pm-app.md`](intent/pm-app.md) → [`specs/web.md`](specs/web.md))
đóng đinh sản phẩm là **mặt kính đọc GitHub**: hộp thư chờ duyệt, form 5 mục,
app không được gọi model, mọi thứ đi qua issue + label và chờ tick 30 giây.

Nó sai ở một chỗ gốc: **nó bắt người dùng làm thư ký cho GitHub.** Điền form,
gắn nhãn, chờ tick, đi lại giữa hai nơi.

Bằng chứng rõ nhất là chính những thứ được yêu cầu build *sau* khi spec đã chốt,
và không có chỗ nào trong spec đó:

| Đã build thêm | Spec cũ xếp nó ở đâu |
|---|---|
| New Task là một **cuộc phỏng vấn**, không còn ô nào để điền (W18) | V2 — "phần đắt nhất của cả sản phẩm", cố ý hoãn |
| **Chat theo dự án**, chat theo task | V2 |
| **Lịch sử từng lần agent chạy** + `usage` + hạn mức | V3 |
| Cầu `bee-spec-chat` bắc qua ranh giới hai UID | Không có trong spec |

Tất cả đều đi về một hướng: **coi agent như người đang làm việc cùng, không phải
cỗ máy nuốt issue.** Bản 2.0 công nhận hướng đó và viết lại mô hình theo nó.

---

## 1. Tổng quan dự án

### 1.1 Vấn đề và Mục tiêu

**Vấn đề hiện tại**

- **Cho ai:** một người — chủ dự án, vừa là người nghĩ ra việc vừa là người
  duyệt kết quả. Đôi khi có thêm một người thứ hai.
  - **Muốn:** giao việc bằng cách nói ra, rồi đi làm việc khác — kể cả đi ngủ.
  - **Sợ:** agent chạy sai cả đêm mà không ai biết; sáng dậy đối mặt mười PR
    không đủ sức đọc nên duyệt bừa; hạn mức Claude cháy sạch lúc 1 giờ sáng và
    phần còn lại của đêm là con số không.
- **Bối cảnh:** hạ tầng chạy agent đã có và đã trả giá xong — sandbox hai UID,
  worktree, bằng chứng, tự phục hồi khi bị `kill -9`. Thứ thiếu không phải sức
  chạy mà là **mặt điều khiển**.
- **Hiện trạng:**
  - *Bên trong:* một máy Ubuntu chạy 24/7 · `bee` với 9 rule đã code xong, M0/M2
    đã nghiệm thu trên máy thật · web app 15 feature slice chạy trên fixture.
  - *Thị trường:* cách làm phổ biến là ngồi trước terminal gõ Claude Code (mất
    khi rời máy), hoặc đẩy hết lên CI/GitHub Actions (mất tương tác, không xem
    được agent đang nghĩ gì). Không cái nào cho phép **vừa live vừa tự chạy**.
- **Nút thắt thật:** không phải máy, không phải model. Là **cửa chặn ở người** —
  và ở bản 1 thì cửa chặn được thiết kế cho một đội hai vai chưa từng tồn tại.

**Mục tiêu**

Một chỗ chạy agent cho các dự án của mình, **mở được từ bất cứ đâu kể cả điện
thoại**: nói chuyện để giao việc, xem agent làm **live**, hoặc thả một xấp việc
rồi đi ngủ.

### 1.2 Giá trị mang lại

- **Thời gian giao việc rơi về gần 0.** Không phải dịch ý tưởng thành 5 mục
  trước khi được phép bấm nút; nói một câu, agent hỏi lại, hợp đồng tự thành hình.
- **Máy không còn nằm chờ người.** Cửa chặn từ ba xuống một, và cửa còn lại nằm
  ngay trong câu chuyện đang nói.
- **Đêm trở thành giờ làm việc.** Chế độ tự chạy có ngân sách và có phanh.
- **Hạ tầng đã trả giá được dùng hết.** `bee` không bị vứt — nó đổi vai.

### 1.3 Tiêu chí Thành công

| # | Thước đo | Ngưỡng |
|---|---|---|
| S1 | Sáng dậy có việc đã xong đang chờ xem | **n > 0, đều đặn** trong một tuần làm việc |
| S2 | Giao được việc từ điện thoại — không ssh, không mở laptop | 100% các lần thử |
| S3 | Số lần phải mở terminal để cứu một phiên agent chết | **0** |
| S4 | Thời gian duyệt một kết quả trên điện thoại | **< 1 phút** |
| S5 | Đêm chạy tự động kết thúc vì *hết việc*, không phải vì *hết hạn mức giữa chừng* | ≥ 80% số đêm |

Hai thước đo của bản 1 — *"một tuần không ai mở GitHub Issues"* và *"agent xong →
người biết dưới 2 phút"* — **bị bỏ**. Cái đầu đo việc thay thế GitHub Issues, mà
GitHub giờ chỉ còn là nơi code rơi xuống, nên nó thành chuyện hiển nhiên chứ
không phải thành tựu.

---

## 2. Đối tượng và Luồng người dùng

### 2.1 User Personas

- **Chủ dự án (persona duy nhất).** Nghĩ ra việc, giao việc, duyệt kết quả. Ngồi
  trước máy vài giờ mỗi ngày; phần còn lại là điện thoại. Không có PM, không có
  Techlead — **hai vai của bản 1 bị xoá.**
- **Người thứ hai (không thường xuyên).** Cùng quyền, không phân vai. Sự tồn tại
  của họ chỉ đòi hỏi một điều: **mỗi thao tác ghi lên GitHub mang đúng tên người
  bấm** — giữ nguyên từ bản 1, vì nó gần như miễn phí và nói thật về lịch sử.

### 2.2 User Stories

- **US-01** — Là chủ dự án, tôi muốn **nói một câu về ý tưởng** và được hỏi lại
  cho tới khi thành một task rõ ràng, để không phải tự viết AC trước khi bắt đầu.
- **US-02** — Là chủ dự án, tôi muốn nói **"ok làm đi"** ngay trong cuộc trò
  chuyện và agent bắt đầu ngay, để không phải đi gắn nhãn ở một màn hình khác.
- **US-03** — Là chủ dự án, tôi muốn **nhìn agent đang làm gì theo thời gian
  thực** — đang đọc file nào, sửa gì, chạy test gì — để biết nó đi đúng hướng mà
  không phải chờ tới lúc xong.
- **US-04** — Là chủ dự án, tôi muốn **dừng một phiên đang đi sai** ngay lập tức.
- **US-05** — Là chủ dự án, tôi muốn thả **một xấp việc trước khi đi ngủ** kèm
  ngân sách hạn mức, để sáng dậy có kết quả.
- **US-06** — Là chủ dự án, tôi muốn **duyệt một kết quả trong một phút trên điện
  thoại**: video, AC đã tick, nó đã đổi gì — rồi bấm merge ngay tại đó.
- **US-07** — Là chủ dự án, tôi muốn **thấy hạn mức Claude còn bao nhiêu** và
  agent tự dừng gọn gàng trước khi cạn, thay vì chết giữa chừng.
- **US-08** — Là chủ dự án, tôi muốn **nới quyền tự chạy dần dần** khi đã tin,
  chứ không phải chọn giữa "hỏi mọi thứ" và "tự do hoàn toàn".
- **US-09** — Là chủ dự án, tôi muốn **hỏi lại agent vì sao nó làm thế** sau khi
  nó xong, nối đúng phiên cũ.

### 2.3 User Flow

**Luồng chính — chế độ live**

```
Mở app (điện thoại/laptop)
  → chọn dự án → nói ý tưởng
  → agent hỏi lại vài câu → in ra hợp đồng task
  → "ok làm đi"                             ← CỬA CHẶN DUY NHẤT
  → phiên agent chạy, màn hình chạy chữ theo thời gian thực
     (dừng được bất cứ lúc nào)
  → xong: PR + video bằng chứng + AC đã tick
  → xem trong 1 phút → Merge (ngay trong app)   ← NỬA CỬA
```

**Luồng phụ — chế độ đi ngủ**

```
Chọn n việc đã có hợp đồng → đặt ngân sách hạn mức + ranh giới tự chạy
  → đóng máy
  → bee chạy lần lượt, tự dọn khi có phiên chết, tự dừng khi chạm ngân sách
  → sáng dậy: danh sách kết quả, cái nào cần người thì nói rõ vì sao
```

---

## 3. Yêu cầu Chức năng

> **P0** (Must) · **P1** (Should) · **P2** (Nice to have)

### Epic 1: Trò chuyện và giao việc

| ID | Tính năng | Mô tả chi tiết | Tiêu chí nghiệm thu | Ưu tiên |
|---|---|---|---|---|
| FR-1.1 | Tạo task bằng phỏng vấn | Nói một câu → agent hỏi lại từng câu → in ra hợp đồng đầy đủ. Không có ô nào để điền tay | • Không form.<br>• Hợp đồng in ra đủ mục bắt buộc.<br>• Issue tạo ra **mang tên người bấm** | **P0** — *đã có* |
| FR-1.2 | "Ok làm đi" là cửa chặn duy nhất | Đồng ý ngay trong hội thoại → agent bắt đầu. Nuốt luôn hai cửa cũ (duyệt spec, `agent:eligible`) | • Từ lúc đồng ý tới lúc agent chạy: **không có thao tác nào khác**.<br>• Không phải mở màn hình thứ hai, không gắn nhãn tay | **P0** — *thiếu* |
| FR-1.3 | Phiên agent có tool, chạy thật | Chat phải **làm được việc**: đọc repo, sửa file trong worktree, chạy test | • Agent trả lời được câu hỏi về code thật trong repo.<br>• Từ một câu yêu cầu → có commit trong worktree | **P0** — *thiếu (`--allowedTools ""`)* |
| FR-1.4 | Xem live | Đầu ra phiên chảy về trình duyệt: đang đọc file nào, sửa gì, chạy lệnh gì | • Chữ bắt đầu chạy **< 5 giây** sau khi đồng ý.<br>• Đóng trình duyệt rồi mở lại: phiên vẫn chạy, xem tiếp được từ chỗ đang tới | **P0** — *thiếu* |
| FR-1.5 | Dừng một phiên | Nút dừng, có hiệu lực ngay | • Phiên dừng < 5s.<br>• Worktree được dọn, không để lại rác | **P0** — *thiếu ở UI* |
| FR-1.6 | Hỏi lại agent sau khi xong | Nối lại đúng phiên cũ để hỏi "vì sao bạn làm thế" | • Trả lời trong vài giây.<br>• Nói rõ nó **nhớ**, không **nhìn lại** | P1 — *đã có (Ask)* |
| FR-1.7 | Chat theo dự án | Hỏi về trạng thái chung của một dự án | • Biết dự án đang có gì chạy, gì chờ | P1 — *đã có* |

### Epic 2: Chế độ tự chạy ("đi ngủ")

| ID | Tính năng | Mô tả chi tiết | Tiêu chí nghiệm thu | Ưu tiên |
|---|---|---|---|---|
| FR-2.1 | Hàng đợi do app sở hữu | Danh sách việc đã có hợp đồng, chờ tới lượt. **Không dùng nhãn GitHub làm hàng đợi nữa** | • Thêm/bớt/đổi thứ tự ngay trong app.<br>• Máy tắt 3 tiếng: không mất việc nào | **P0** — *thiếu* |
| FR-2.2 | Thả một xấp việc | Chọn n việc → "chạy đêm nay" | • Chạy lần lượt, tôn trọng trần slot | **P0** — *thiếu* |
| FR-2.3 | Ngân sách hạn mức cho một đêm | Đặt trần token/số phiên. Chạm trần thì **dừng gọn**, không chết giữa chừng | • Chạm trần → phiên đang chạy kết thúc sạch, việc còn lại vẫn nằm trong hàng đợi.<br>• Sáng dậy đọc được: đã tiêu bao nhiêu, dừng vì lý do gì | **P0** — *thiếu* |
| FR-2.4 | Mở khoá dần | Ba mức: **hỏi trước mọi thứ** → **tự chạy trong ranh giới** (chỉ những dự án/loại việc đã chỉ định) → **tự chạy hết**. Đặt theo từng dự án | • Đổi mức mà không cần sửa file cấu hình trên máy.<br>• Mức hiện tại nhìn thấy được ở mọi màn | **P0** — *thiếu* |
| FR-2.5 | Bản tin buổi sáng | Một chỗ đọc: đêm qua chạy gì, xong gì, kẹt gì và **vì sao** | • Mỗi việc kẹt có một câu lý do đọc được, không phải mã lỗi | P1 — *thiếu* |
| FR-2.6 | Báo ra ngoài (Slack/push) | Báo khi có việc cần người | • Gộp, không spam, không bắn lại | **P2** — *đã có, hạ ưu tiên* |

### Epic 3: Hạn mức là tài nguyên hạng nhất

| ID | Tính năng | Mô tả chi tiết | Tiêu chí nghiệm thu | Ưu tiên |
|---|---|---|---|---|
| FR-3.1 | Nhìn thấy hạn mức | Còn bao nhiêu, đang tiêu với tốc độ nào, chu kỳ reset khi nào | • Hiện ở mọi màn, không phải đi tìm | **P0** — *đã có một phần* |
| FR-3.2 | Quy hạn mức về từng việc | Mỗi lần chạy ghi lại đã tiêu bao nhiêu | • Mở một task thấy nó đã tốn bao nhiêu qua bao nhiêu lần chạy | **P0** — *đã có (R4.3 + run-list)* |
| FR-3.3 | Phanh trước khi cạn | Còn dưới ngưỡng → không khởi động phiên mới, nói rõ đang giữ lại cho việc gì | • Không có phiên nào chết vì hết hạn mức giữa chừng | **P0** — *thiếu* |
| FR-3.4 | Trần chi cho một task | Một task ngốn quá ngưỡng → dừng và hỏi người | • Không có vòng lặp retry nào đốt quota qua đêm | P1 — *một phần trong bee* |

### Epic 4: Duyệt trong một phút

| ID | Tính năng | Mô tả chi tiết | Tiêu chí nghiệm thu | Ưu tiên |
|---|---|---|---|---|
| FR-4.1 | Màn duyệt gọn cho điện thoại | Một màn: video bằng chứng + AC đã tick + tóm tắt "đã đổi gì" + nút | • Duyệt xong **< 1 phút** trên điện thoại thật.<br>• Video phát ngay trong trang, không tải file | **P0** — *một phần* |
| FR-4.2 | **Nút merge trong app** | Merge PR bằng token của người bấm | • Merge được từ điện thoại.<br>• GitHub ghi nhận đúng tên người bấm | **P0** — *thiếu; bản 1 cấm điều này* |
| FR-4.3 | Tóm tắt thay đổi đọc được | Agent tự viết "tôi đã đổi gì và vì sao" | • Đọc trong 20 giây là hiểu | P1 — *thiếu* |
| FR-4.4 | Xem diff | **Không làm.** Đưa link sang GitHub | • Có link PR ở mọi chỗ liên quan | — *đã có* |

### Epic 5: Sân chạy an toàn (`bee` đổi vai)

> `bee` thôi làm "cỗ máy tự nhặt issue trên GitHub". Nó trở thành **sân chạy an
> toàn cho các phiên agent do app khởi động**. Tick 30 giây không biến mất, nó
> lùi về việc nền.

| ID | Tính năng | Mô tả chi tiết | Tiêu chí nghiệm thu | Ưu tiên |
|---|---|---|---|---|
| FR-5.1 | Giữ nguyên ranh giới hai UID | `bee-agent` không token, không docker, không sudo | • Ba lệnh kiểm ranh giới vẫn đúng | **P0** — *đã có, không được đụng* |
| FR-5.2 | Khởi động phiên từ app | App yêu cầu → sân chạy dựng worktree, chạy phiên có tool, stream về | • App **không** giữ credential Claude.<br>• Một cây cầu duy nhất qua ranh giới UID, gỡ được bằng một lệnh | **P0** — *cầu đã có, chở sai hàng* |
| FR-5.3 | Tự dọn khi phiên chết | `kill -9` giữa chừng → dọn trong một tick; lần hai → gắn cờ cần người | • Đã nghiệm thu (44s trên máy thật) | **P0** — *đã có (rule 01)* |
| FR-5.4 | Việc nền giữ nguyên | CI, quay bằng chứng, dọn `evidence/`, đối chiếu | • Không đổi | **P0** — *đã có (rule 03/04/09)* |
| FR-5.5 | Kill switch | `/etc/bee/PAUSE` và `.agent/PAUSE` | • Cả hai tầng dừng được, tầng repo tháo ra được | **P0** — *đã có* |
| FR-5.6 | GitHub là nơi kết quả rơi xuống | Vẫn tạo issue/PR/comment/approve mang tên người thật — nhưng **không còn là hàng đợi** | • Không thao tác nào của người đòi hỏi mở GitHub, trừ review diff | **P0** — *cần sửa* |

### Epic 6: Dự án và truy cập

| ID | Tính năng | Mô tả chi tiết | Tiêu chí nghiệm thu | Ưu tiên |
|---|---|---|---|---|
| FR-6.1 | Nhiều dự án, 1 dự án = 1 repo | Giữ nguyên ràng buộc | • Thêm dự án trong app; nói rõ bước còn lại trên máy | P1 — *đã có* |
| FR-6.2 | Vào được từ internet | Cloudflare Access ở rìa + GitHub OAuth trong app | • Đăng nhập từ mạng ngoài; người lạ không thấy gì | **P0** — *chưa nghiệm thu (B4)* |
| FR-6.3 | Dùng được trên điện thoại | Giao việc, xem live, duyệt, merge | • Cả bốn việc làm được trên màn hình điện thoại thật | **P0** — *một phần* |
| FR-6.4 | Nói thật khi hệ thống hỏng | Heartbeat cũ, `status.json` thiếu/hỏng → báo, không giấu, không crash | • Tắt reconciler 15 phút → app vẫn lên và **báo đỏ** | **P0** — *đã có* |

---

## 4. Yêu cầu Phi chức năng

- **Độ trễ cảm nhận:** chữ đầu tiên của một phiên live xuất hiện **< 5 giây** sau
  khi bấm. Mọi trạng thái chờ phải nói ra nó đang chờ *cái gì* và *bao lâu nữa* —
  **không có spinner vô tận.** Nói dối về độ trễ tệ hơn độ trễ.
- **Bảo mật — không được nới:**
  - `bee-agent` không `GH_TOKEN`, không group `docker`, không sudo.
  - Web app không giữ `GH_TOKEN`, không ghi vào state của reconciler, không chạy
    `docker`/`systemctl`/`sudo`.
  - Token GitHub của người dùng nằm trong cookie httpOnly đã mã hoá, **không bao
    giờ** lộ qua `session()`.
  - Mọi route handler tự kiểm session — không tin proxy (CVE-2025-29927).
  - Route đọc bằng chứng chặn path traversal.
  - **Điều mới cần siết:** phiên agent có tool là bề mặt tấn công mới. Tool chỉ
    được hoạt động **trong worktree của đúng task đó**, dưới `bee-agent`.
- **Bền bỉ:** máy tắt/mất điện → không mất việc trong hàng đợi; `kill -9` giữa
  chừng → tự dọn trong một tick.
- **Nền tảng:** Chrome/Safari bản mới; **điện thoại là hạng nhất**, không phải
  "cũng dùng được".
- **Quy mô thật:** một máy Ubuntu, dăm ba repo cá nhân, 1–3 phiên song song.
  Máy và số slot **không phải** ràng buộc — hạn mức Claude mới là.

---

## 5. Yêu cầu về Thiết kế

- **Design system: Geist (Vercel)** — [`docs/design/vercel-geist.md`](design/vercel-geist.md).
  Nền gần trắng, mực gần đen, kẻ 1px thay đổ bóng, không nút bo tròn kiểu viên
  thuốc, màu trạng thái chỉ nằm trong chấm 6px / viền 1px / chữ.
- **Ngôn ngữ:** giao diện **tiếng Anh**, tài liệu **tiếng Việt**. Cần dọn nốt chỗ
  lệch: đường dẫn còn tiếng Việt (`/viec`, `/du-an`), vài chuỗi placeholder còn
  tiếng Việt.
- **Trạng thái phải vẽ đủ:** rỗng vì hết việc ≠ rỗng vì bộ lọc ≠ đang tải ≠ hỏng.
  Rỗng là trạng thái **tốt** và phải trông như vậy.
- **Màn hình live là màn hình mới quan trọng nhất** và chưa có mockup nào.

---

## 6. Yêu cầu Kỹ thuật & Tích hợp

**Kiến trúc mục tiêu**

```
Trình duyệt (kể cả điện thoại)
   │  HTTPS qua Cloudflare Access
   ▼
bee-web  (UID riêng, không token, không sudo, không docker)
   │  đọc /srv/bee/**            ← trạng thái, bằng chứng, hạn mức
   │  ghi hàng đợi của riêng nó  ← MỚI: app sở hữu hàng đợi
   │  gọi GitHub bằng token NGƯỜI BẤM
   │  một Unix socket duy nhất   ← cây cầu qua ranh giới UID
   ▼
bee-agent (có đăng nhập Claude, KHÔNG token GitHub, KHÔNG docker)
   └── phiên agent có tool, chạy trong worktree của đúng task đó
   ▲
bee-orch (có token, có docker) — việc nền: CI, bằng chứng, dọn phiên chết
```

**Ba thay đổi kỹ thuật lớn**

1. **Cây cầu `bee-spec-chat` phải chở được hàng thật.** Hiện nó gọi
   `claude --allowedTools ""` — tool tắt ở mọi vai, nên mọi cuộc chat chỉ *nói*
   chứ không *làm*. Cần: phiên có tool, chạy trong worktree, stream tiến độ,
   dừng được. **Đây là phần đắt nhất và rủi ro nhất của bản 2.0.**
2. **Hàng đợi rời khỏi nhãn GitHub.** Rule 07 hiện quét issue có `agent:build`
   **và** `agent:eligible`. Thay bằng hàng đợi do app sở hữu, ghi vào thư mục
   *của riêng web app* (**không** ghi vào state của reconciler — ranh giới đó
   giữ nguyên), sân chạy đọc từ đó.
   > **Chưa quyết:** vị trí và định dạng của store này; ai là người đọc cuối
   > cùng (`reconcile.sh` hay một unit mới). Chốt trong spec.
3. **Nút merge.** Dùng token OAuth của người bấm. Bản 1 cấm tuyệt đối điều này
   để bảo vệ dấu vết khi có hai người ở hai vai; với một người thì nó chỉ còn là
   một chuyến đi sang tab khác.

**Giữ nguyên, không đàm phán:** hai UID · worktree · bằng chứng trên đĩa theo
`<slug>/<num>/<sha>` · rule 01 phục hồi · kill switch hai tầng · mọi ghi lên
GitHub mang tên người thật.

**Tracking:** `usage`/`stop_reason` mỗi lần gọi model (đã có, R4.3) là nguồn
cho toàn bộ Epic 3.

---

## 7. Kế hoạch Triển khai

### 7.1 Lộ trình

| Phase | Gồm | Xong nghĩa là |
|---|---|---|
| **V1 — Live** | FR-1.2 · FR-1.3 · FR-1.4 · FR-1.5 · FR-5.2 · FR-6.2 | Nói "ok làm đi" → nhìn agent làm → có PR. Từ điện thoại |
| **V2 — Duyệt & merge** | FR-4.1 · FR-4.2 · FR-4.3 · FR-3.1 | Vòng đời khép kín trong app: giao → xem → merge |
| **V3 — Đi ngủ** | Epic 2 đầy đủ + FR-3.3 · FR-3.4 | Thả một xấp việc, sáng dậy có kết quả và một bản tin |
| **V4 — Dọn nợ** | Xoá đường cũ (nhãn làm hàng đợi, hộp thư 5 loại, cửa duyệt spec), đồng bộ lại tài liệu | Không còn hai mô hình cùng tồn tại trong một repo |

**V1 trước V3 là có chủ ý:** chế độ tự chạy chỉ đáng tin sau khi đã tự tay chứng
kiến chế độ live làm đúng đủ nhiều lần. Niềm tin là ràng buộc, và nó chỉ mua
được bằng số lần nhìn thấy.

### 7.2 Rủi ro

| Rủi ro | Mức độ | Xử lý |
|---|---|---|
| Mở tool cho phiên agent qua cây cầu socket = bề mặt tấn công mới | **Cao** | Tool chỉ sống trong worktree của đúng task; `bee-agent` vẫn không token/không docker; review riêng cho thay đổi này |
| Hạn mức cháy trong một đêm | **Cao** | FR-3.3 (phanh trước khi cạn) là **P0**, không phải P1 |
| Hai mô hình cùng tồn tại (nhãn-hàng-đợi và app-hàng-đợi) | **Cao** | V4 xoá dứt điểm; trước đó, đúng một đường được coi là thật và ghi rõ trong `AGENTS.md` |
| Thông lượng cao chuyển nút thắt sang chính mình | Trung bình | Epic 4 (duyệt < 1 phút) đi trước Epic 2 |
| Tự chạy làm sai cả đêm | Trung bình | Mở khoá dần (FR-2.4) + bản tin sáng nói rõ lý do kẹt |
| Tài liệu lại lệch khỏi code | Trung bình | PRD này là nguồn duy nhất về *muốn gì*; sửa mô hình thì sửa ở đây trước |

---

## 8. Khoảng cách với repo hiện tại

> Đối chiếu tại commit `27fe19a` (17/08/2026).

### 8.1 Giữ — đúng với bản 2.0, không phải viết lại

| Thứ | Ở đâu |
|---|---|
| Sandbox hai UID, sudoers, polkit, `bee-task@`, `bee.slice` | [apps/reconciler/](apps/reconciler/) |
| Vòng đời worktree, rule 01 phục hồi, 03 CI, 04 bằng chứng, 09 đối chiếu | [rules/](apps/reconciler/rules/) |
| Bằng chứng trên đĩa `<slug>/<num>/<sha>` + viewer chặn path traversal | [evidence-path.ts](apps/web/src/lib/bee/evidence-path.ts) |
| `usage`/`stop_reason` mỗi lần chạy + lịch sử từng lần | [run-list.tsx](apps/web/src/features/task/components/run-list.tsx) · [lib/claude/](apps/web/src/lib/claude/) |
| Tạo task bằng phỏng vấn — không còn form | [create-task-dialog.tsx](apps/web/src/features/task-new/components/create-task-dialog.tsx) |
| Cây cầu socket qua ranh giới UID | [spec-chat.mjs](apps/reconciler/bin/spec-chat.mjs) · [api/spec-chat/route.ts](apps/web/src/app/api/spec-chat/route.ts) |
| Ask — nối lại phiên cũ để hỏi vì sao | [task-chat.tsx](apps/web/src/features/task/components/task-chat.tsx) |
| Design system Geist, bộ e2e 13 spec, 4 cổng chất lượng | [apps/web/](apps/web/) |

### 8.2 Sửa — đúng hướng nhưng chở sai hàng

| Hiện tại | Phải thành | Vì sao |
|---|---|---|
| `claude --allowedTools ""` — **tool tắt ở mọi vai** ([spec-chat.mjs:128](apps/reconciler/bin/spec-chat.mjs#L128)) | Phiên có tool, trong worktree, stream được, dừng được | Chat hiện chỉ *nói*, không *làm*. Đây là khoảng cách lớn nhất |
| "Request a change" = đăng comment `@claude`, chờ tick 30s ([task-chat.tsx:104](apps/web/src/features/task/components/task-chat.tsx#L104)) | Đường live song song với đường comment | FR-1.4 |
| Rule 07 quét `agent:build` + `agent:eligible` ([07-build.sh:21](apps/reconciler/rules/07-build.sh#L21)) | Hàng đợi do app sở hữu | FR-2.1 · FR-5.6 |
| Hộp thư 5 loại mục suy từ nhãn ([inbox/lib/derive.ts](apps/web/src/features/inbox/lib/derive.ts)) | Thu gọn còn hai: *đang chạy* và *chờ bạn xem* | Ba cửa chặn cũ biến mất |
| Đường dẫn tiếng Việt `/viec`, `/du-an` trong khi UI tiếng Anh | Thống nhất | §5 |

### 8.3 Bỏ — sai mô hình

| Bỏ | Vì |
|---|---|
| Hai vai PM / Techlead tách nhau | Chỉ có một persona |
| Cửa "duyệt spec" (`status:spec-review`) như một bước riêng | Nuốt vào "ok làm đi" |
| Cửa "cho phép nhận task" (gắn `agent:eligible` tay) | Như trên |
| Luật **"không bao giờ có nút merge"** ([AGENTS.md §6](AGENTS.md)) | FR-4.2 lật lại. Lý do cũ (dấu vết khi có hai vai) không còn |
| Thước đo *"một tuần không ai mở GitHub Issues"* | Đã thành hiển nhiên, không còn là thành tựu |
| Slack như thước đo trung tâm | Hạ xuống P2 |

### 8.4 Thiếu — chưa có gì

| Thiếu | Thuộc |
|---|---|
| Màn hình xem phiên live (kể cả nhiều phiên song song) | FR-1.4 |
| Nút dừng một phiên | FR-1.5 |
| Hàng đợi do app sở hữu | FR-2.1 |
| Thả một xấp việc + ngân sách một đêm | FR-2.2 · FR-2.3 |
| Ba mức mở khoá dần | FR-2.4 |
| Bản tin buổi sáng | FR-2.5 |
| Phanh hạn mức trước khi cạn | FR-3.3 |
| Màn duyệt gọn cho điện thoại + **nút merge** | FR-4.1 · FR-4.2 |
| Tóm tắt "tôi đã đổi gì và vì sao" | FR-4.3 |

### 8.5 Tài liệu nói sai sự thật

| Chỗ | Đã nói sai điều gì | Trạng thái |
|---|---|---|
| [README.md](README.md) | web "mới có spec", `apps/web/` "chưa scaffold"; vòng đời task theo mô hình cũ | ✅ đã sửa 17/08 |
| [AGENTS.md](AGENTS.md) | §4 cấm merge · §5 "intent thắng về *what*" · §6 "không nút merge ở bất kỳ đâu" | ✅ đã sửa 17/08 |
| [docs/intent/pm-app.md](docs/intent/pm-app.md) | Ý định 13/08 | ✅ đã gắn banner thay thế, giữ nguyên văn |
| [docs/specs/web.md](docs/specs/web.md) | "Chưa viết dòng code nào" · chat ý tưởng ở V2, dashboard ở V3 (cả hai đã build) | ⚠️ đã gắn cảnh báo · **spec mới chưa viết** |
| [docs/architecture.html](architecture.html) | Vẽ theo mô hình cũ | ⚠️ chưa sửa, đã đánh dấu ở README |
| [tasks/plan.md](../tasks/plan.md) · [tasks/todo.md](../tasks/todo.md) | Chia mốc A/B/C theo mô hình cũ | ⚠️ chưa sửa — viết lại sau khi có spec mới |

### 8.6 Việc của người còn treo, không liên quan tới đổi mô hình

`P1.2` 4 task nữa · `P1.3` sửa prompt · `P4.2` TL comment thật · `B3` ghi thật ·
`B4` OAuth + Cloudflare Access · `B5` nghiệm thu — xem [tasks/todo.md](tasks/todo.md).
`B4` giờ là **P0 của V1**: không có nó thì "giao việc từ điện thoại" không tồn tại.

---

## 9. Phụ lục

**Thuật ngữ**

| | |
|---|---|
| **Sân chạy** | `bee` ở vai mới: nơi phiên agent chạy an toàn, không còn tự nhặt việc |
| **Cây cầu** | Unix socket duy nhất từ `bee-web` sang `bee-agent` |
| **Hợp đồng task** | Bộ mục bắt buộc của một task, sinh ra từ cuộc phỏng vấn |
| **Mở khoá dần** | Ba mức quyền tự chạy, nới theo niềm tin |

**Tài liệu liên quan**

- [docs/architecture.html](docs/architecture.html) — bản đồ hệ thống *(mô tả mô hình cũ)*
- [docs/design/reconciler.md](docs/design/reconciler.md) — lý lẽ thiết kế `bee`
- [docs/design/vercel-geist.md](docs/design/vercel-geist.md) — design system
- [AGENTS.md](AGENTS.md) — quy ước code *(§6 có luật "không nút merge" bị PRD này lật)*
- [tasks/plan.md](tasks/plan.md) · [tasks/todo.md](tasks/todo.md)
</content>
</invoke>
