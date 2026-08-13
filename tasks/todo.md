# TODO

Chi tiết ở [`plan.md`](plan.md). 🧑 = chỉ người làm được · 🤖 = tôi làm được

**Thứ tự:** web trên fixture trước (A) → nghiệm thu reconciler song song (C) →
nối vào dữ liệu thật (B, cần cả hai).

---

## A · Web trên fixture ← đang làm

- [x] 🤖 **W1** Bộ khung — 4 cổng chất lượng xanh trước khi có code để bảo vệ
- [x] 🤖 **W2** Đường ranh dữ liệu + fixture sinh từ schema thật
- [ ] 🤖 **W3** Đăng nhập · người ngoài allowlist thấy trống · token không lộ ra client
- [ ] 🤖 **W4** Sức khoẻ hệ thống · heartbeat cũ báo đỏ · JSON hỏng không crash
- [ ] 🤖 **W5** Hộp thư "đang chờ bạn" — màn hình chính
- [ ] 🤖 **W6** Trang task — issue + PR thành một trang
- [ ] 🤖 **W7** Tạo task theo hợp đồng 5 mục
- [ ] 🤖 **W8** Chat vào task — không spinner vô tận
- [ ] 🤖 **W9** Xem bằng chứng — **chặn path traversal ngay từ đầu**
- [ ] 🤖 **W10** PM duyệt · không có nút merge ở bất kỳ đâu
- [ ] 🤖 **W11** Slack — gộp, không spam, không bắn lại
- [ ] 🧑 **W12** Bạn duyệt giao diện qua đủ 5 cảnh dữ liệu

> **✅ Checkpoint A** — demo được cho cả đội mà không cần máy Ubuntu nào

## C · Nghiệm thu reconciler — song song, không chặn A

- [ ] 🧑 **P0.1** Cài lên máy Ubuntu
- [ ] 🧑 **P0.2** Ba lệnh ranh giới token
- [ ] 🧑 **P0.3** `be repo add` — `origin/HEAD` phân giải được
- [ ] 🧑 **P0.4** Kill switch cả hai tầng (`.agent/PAUSE` chưa từng chạy)
- [ ] 🧑 **P0.5** Khoá unit, tick không chồng, `be dry-run`
- [ ] 🧑 **P1.1** Một task nhỏ → draft PR sạch
- [ ] 🧑 **P1.2** Bốn task nữa — 3/5 không can thiệp tay
- [ ] 🤖 **P1.3** Sửa prompt theo những gì học được
- [ ] 🧑 **P2.1** Rút điện → rule 01 dọn; lần hai → `needs-human`
- [ ] 🧑 **P2.2** Rule 03 đẩy `bee/test`
- [ ] 🧑 **P2.3** Dashboard vẫn lên khi reconciler đã chết
- [ ] 🤖 **R3.1** Bằng chứng sang `/srv/bee/evidence/…` · đổi mốc scan · bỏ MinIO
- [ ] 🤖 **R3.2** Dọn `evidence/`
- [ ] 🤖 **R4.1** Rule 02 quét cả comment thường, không đếm trùng
- [ ] 🧑 **P4.2** TL comment thật → agent sửa đúng chỗ

> **✅ Checkpoint C** — reconciler xong M0–M4

## B · Nối vào dữ liệu thật — cần cả A lẫn C

- [ ] 🤖 **B1** `lib/bee/disk.ts` — type khớp `status.json` thật
- [ ] 🤖 **B2** `lib/github/live.ts` — hình dạng response thật
- [ ] 🧑🤖 **B3** Ghi thật: tạo issue, comment, approve — mang tên người bấm
- [ ] 🧑 **B4** OAuth + Cloudflare Access thật
- [ ] 🧑 **B5** Nghiệm thu V1 — một tuần không ai mở GitHub Issues

---

## Nhắc một điều dễ quên khi làm trên fixture

Không component nào, không hook nào được biết mình đang chạy trên fixture. Một
`if (isFixture)` lọt vào tầng UI là đường ranh đã hỏng, và pha B sẽ biến thành
viết lại thay vì đổi một biến môi trường.
