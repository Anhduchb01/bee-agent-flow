# TODO

Chi tiết ở [`plan.md`](plan.md). 🧑 = chỉ người làm được · 🤖 = tôi làm được

**Thứ tự:** web trên fixture trước (A) → nghiệm thu reconciler song song (C) →
nối vào dữ liệu thật (B, cần cả hai).

---

## A · Web trên fixture ← chỉ còn W12 (bạn duyệt)

- [x] 🤖 **W1** Bộ khung — 4 cổng chất lượng xanh trước khi có code để bảo vệ
- [x] 🤖 **W2** Đường ranh dữ liệu + fixture sinh từ schema thật
- [x] 🤖 **W3** Đăng nhập · người ngoài allowlist thấy trống · token không lộ ra client
- [x] 🤖 **W4** Sức khoẻ hệ thống · heartbeat cũ báo đỏ · JSON hỏng không crash
- [x] 🤖 **W5** Hộp thư "đang chờ bạn" — màn hình chính
- [x] 🤖 **W6** Trang task — issue + PR thành một trang
- [x] 🤖 **W7** Tạo task theo hợp đồng 5 mục
- [x] 🤖 **W8** Chat vào task — không spinner vô tận
- [x] 🤖 **W9** Xem bằng chứng — **chặn path traversal ngay từ đầu**
- [x] 🤖 **W10** PM duyệt · không có nút merge ở bất kỳ đâu
- [x] 🤖 **W11** Slack — gộp, không spam, không bắn lại
- [x] 🤖 **W13** Design system Geist (Vercel) — [`docs/design/vercel-geist.md`](../docs/design/vercel-geist.md)
- [x] 🤖 **W14** Bảng việc có bộ lọc từng cột · dải thống kê mọi màn
- [x] 🤖 **W15** Dự án: thêm dự án · danh sách task · hai kiểu xem bảng/kanban
- [x] 🤖 **W16** Tạo task bằng modal trong chi tiết dự án
- [x] 🤖 **W17** Giao diện chuyển hết sang tiếng Anh · vá lệch tên năm mục hợp đồng
- [ ] 🧑 **W12** Bạn duyệt giao diện qua đủ 5 cảnh dữ liệu
      → ảnh đã chụp sẵn 44 tấm qua 9 cảnh, xem trang duyệt (link trong hội thoại).
      Chụp lại bằng `CHUP_ANH=<thư mục> pnpm exec playwright test chup-anh`.

> **✅ Checkpoint A** — demo được cho cả đội mà không cần máy Ubuntu nào

## C · Nghiệm thu reconciler ← M0 xong · M1 còn 4 task · M2 xong

- [x] 🧑 **P0.1** Cài lên máy Ubuntu
- [x] 🧑 **P0.2** Ba lệnh ranh giới token
- [x] 🧑 **P0.3** `be repo add` — `origin/HEAD` phân giải được
- [x] 🧑 **P0.4** Kill switch cả hai tầng — tầng repo từng là **cửa một chiều**, đã vá
- [x] 🧑 **P0.5** Khoá unit, tick không chồng, `be dry-run` không ghi gì
- [x] 🧑 **P1.1** Một task nhỏ → draft PR sạch (PR #6, 4 file, không lọt rác)
- [ ] 🧑 **P1.2** Bốn task nữa — 3/5 không can thiệp tay
- [ ] 🤖 **P1.3** Sửa prompt theo những gì học được
- [x] 🧑 **P2.1** Rút điện → rule 01 dọn trong 44s; lần hai → `needs-human`
- [x] 🧑 **P2.2** Rule 03 đẩy `bee/test` — xanh 21s trên PR thật
- [x] 🧑 **P2.3** Dashboard vẫn lên khi reconciler đã chết, dải đỏ báo heartbeat cũ
- [ ] 🤖 **R3.1** Bằng chứng sang `/srv/bee/evidence/…` · đổi mốc scan · bỏ MinIO
- [ ] 🤖 **R3.2** Dọn `evidence/`
- [x] 🤖 **R4.3** `run_agent` giữ `usage`/`stop_reason` · hạn mức ra file riêng
- [ ] 🤖 **R4.1** Rule 02 quét cả comment thường, không đếm trùng
- [ ] 🧑 **P4.2** TL comment thật → agent sửa đúng chỗ

> **✅ Checkpoint C** — reconciler xong M0–M4

## B · Nối vào dữ liệu thật — cần cả A lẫn C

- [ ] 🤖 **B1** `lib/bee/disk.ts` — type khớp `status.json` thật
- [ ] 🤖 **B6** `lib/claude/live.ts` — cộng dồn `recent.jsonl` + đọc file hạn mức
      (phía reconciler xong rồi, xem R4.3)
- [ ] 🤖 **B2** `lib/github/live.ts` — hình dạng response thật
- [ ] 🧑🤖 **B3** Ghi thật: tạo issue, comment, approve — mang tên người bấm
- [ ] 🧑 **B4** OAuth + Cloudflare Access thật
- [ ] 🧑 **B5** Nghiệm thu V1 — một tuần không ai mở GitHub Issues

---

## Nhắc một điều dễ quên khi làm trên fixture

Không component nào, không hook nào được biết mình đang chạy trên fixture. Một
`if (isFixture)` lọt vào tầng UI là đường ranh đã hỏng, và pha B sẽ biến thành
viết lại thay vì đổi một biến môi trường.
