# TODO

Chi tiết ở [`plan.md`](plan.md). 🧑 = chỉ người làm được · 🤖 = tôi làm được

**Mốc đang làm:** V1 Live — [`docs/specs/v1-live.md`](../docs/specs/v1-live.md)
**Thứ tự:** gỡ ẩn số (L0) → bash và web chạy song song (L1 ∥ L2) → nối (L3) → cửa và truy cập (L4)

---

## L0 · Gỡ ẩn số ← làm trước mọi thứ

- [ ] 🤖 **L0.1** Rig `stream-json` hai chiều — gõ chen lúc agent đang giữa một
      tool call thì CLI xếp hàng hay bỏ?
      → Trả về hai thứ: câu trả lời, và một `run.jsonl` **thật** làm fixture cho
      toàn bộ L2. Nếu CLI bỏ tin nhắn thì **dừng và báo** — UI phải hứa khác.

## L1 · Bản ghi sống trên đĩa (bash) ← song song được với L2

- [ ] 🤖 **L1.1** Tách `run_archive` → `run_open` + `run_close`; thư mục run ra
      đời **lúc bắt đầu**, `meta.json` mang `status` + `started_at`
      → `lib/bee/types.ts` phải đổi trong **cùng commit**.
- [ ] 🤖 **L1.2** `agent-exec.sh` ghi `run.jsonl` thẳng vào thư mục bền
      → `kill -9` giữa chừng: `meta.json` không được kẹt ở `running`.

> **✅ Checkpoint A** — `tail -f` được một phiên đang chạy, từ user ngoài group `bee`.
> Review riêng phần bash trước khi đi tiếp.

## L2 · Web đọc luồng đang chảy ← không cần máy Ubuntu

- [ ] 🤖 **L2.1** `run-stream.ts` + `parse-events.ts` — thuần, test bằng fixture
      của L0.1 · **dòng JSON cắt đôi không được phát nửa dòng**
- [ ] 🤖 **L2.2** Route SSE — `Last-Event-ID` · `bee_replayed` · đóng khi phiên
      xong · từ chối `../` và request không session
- [ ] 🤖 **L2.3** Màn hình live — dòng sự kiện · mất kết nối không xoá màn hình ·
      chạy được trên điện thoại

> **✅ Checkpoint B** — demo được trên fixture, chưa cần một máy Ubuntu nào.
> Bạn duyệt bố cục màn live trước khi nối vào máy thật.

## L3 · Đường điều khiển và đường vào

- [ ] 🤖 **L3.1** `bee-request.path` → `bee-request.service` — web ghi file, orch
      khởi động
      → **web không được cấp sudo hay polkit.** Đây là chỗ spec đã sai một lần.
      Rig 6 file yêu cầu (2 hợp lệ, 4 độc) → đúng 2 unit chạy.
- [ ] 🤖 **L3.2** Web ghi file yêu cầu · `StateDirectory=bee-web` · vẫn không ghi
      được vào `/srv/bee/**`
- [ ] 🤖 **L3.3** FIFO mở read-write + `--input-format stream-json` + `--session-id`
- [ ] 🤖 **L3.4** Lệnh `say` ở cầu nối + ô gõ trong màn live

> **✅ Checkpoint C** — vòng live khép kín trên máy thật: xem · gõ chen · dừng ·
> `systemctl restart bee-web` giữa chừng mà phiên không hề hấn.

## L4 · Cửa duy nhất và truy cập thật

- [ ] 🤖 **L4.1** "Ok làm đi" — một nút, bốn bước, **chữ chạy trong < 5 giây**
      → Hỏng bước nào phải nói ra **bước đó**.
- [ ] 🤖 **L4.2** Nút Dừng — < 5 giây, worktree sạch, không FIFO mồ côi
- [ ] 🧑 **L4.3** OAuth app thật + Cloudflare Access ← làm song song bất cứ lúc nào
- [ ] 🧑 **L4.4** Nghiệm thu V1 — [spec §10](../docs/specs/v1-live.md), 15 mục,
      làm **trên điện thoại, ngoài mạng nhà**

> **✅ Checkpoint D** — V1 xong.

---

## Nợ cũ — mang sang từ plan 13/08

Ba việc còn treo. **Hai trong ba đã đổi nghĩa** vì PRD 2.0 lật mô hình:

- [ ] 🧑 **P1.3** Sửa `prompts/build.md` theo từng lần phải can thiệp tay
      → **Vẫn đúng nguyên**, và quan trọng hơn trước: phiên live dùng chung prompt đó.
- [ ] 🧑 **P1.2** ~~Bốn task nữa qua rule 07, 3/5 không can thiệp tay~~
      → **Đổi nghĩa.** Rule 07 (nhận việc theo nhãn) sẽ bị thay ở V4. Thước đo
      "3/5 ra PR không can thiệp" chuyển sang đo **phiên live** ở L4.4.
- [ ] 🧑 **P4.2** ~~TL comment thật → agent sửa đúng chỗ nhờ `--resume`~~
      → **Đổi nghĩa.** Rule 02 vẫn giữ làm đường chậm, nhưng đường chính giờ là
      gõ chen trực tiếp (L3.4). Nghiệm thu gộp vào checkpoint C.
- [x] 🤖 **B1 · B2 · B6** Đọc `/srv/bee` thật · map GitHub · cộng dồn hạn mức
- [ ] 🧑 **B3** Ghi thật (tạo issue, comment, approve mang tên người bấm)
      → Gộp vào **L4.1** và **L4.4**, không còn là task riêng.
- [ ] 🧑 **B4** OAuth + Cloudflare Access → đổi tên thành **L4.3**, và giờ là
      **P0 của V1**: không có nó thì "giao việc từ điện thoại" không tồn tại.
- [ ] 🧑 **B5** Nghiệm thu → đổi tên thành **L4.4**

## Việc đã xong, giữ lại để không làm lại

- [x] 🤖 **W1–W11 · W13–W18** Web trên fixture: hộp thư · trang dự án · trang
      task · tạo task bằng phỏng vấn · chat · bằng chứng · Slack · Geist · kanban
- [x] 🧑 **P0.1–P0.5** Cài máy, ranh giới token, kill switch hai tầng, khoá unit
- [x] 🧑 **P1.1** Một task nhỏ → draft PR sạch (PR #6)
- [x] 🧑 **P2.1–P2.3** Rút điện → rule 01 dọn 44s · `bee/test` xanh 21s · dashboard sống
- [x] 🤖 **R3.1 · R3.2 · R4.1 · R4.3** Bằng chứng trên đĩa · dọn `evidence/` ·
      rule 02 quét ba nguồn · giữ `usage`/`stop_reason`
- [ ] 🧑 **W12** ~~Duyệt giao diện qua 5 cảnh dữ liệu~~
      → Thay bằng **checkpoint B**: duyệt màn live, vì đó mới là màn hình mới.

---

## Nhắc hai điều dễ quên

**Không component nào, không hook nào được biết mình đang chạy trên fixture.**
Một `if (isFixture)` lọt vào tầng UI là đường ranh đã hỏng.

**V1 không gỡ rule 07.** Hai mô hình cùng tồn tại trong suốt V1–V3, và đó là có
chủ ý: gỡ đường cũ trước khi đường mới chạy thật là cách nhanh nhất để mất cả
hai. Dọn ở V4.
