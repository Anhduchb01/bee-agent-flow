# TODO

Chi tiết từng task ở [`plan.md`](plan.md). 🧑 = chỉ người làm được · 🤖 = tôi làm được

---

## P0 · Nghiệm thu vòng lặp — CỔNG CHẶN TOÀN BỘ

- [ ] 🧑 **P0.1** Cài lên máy Ubuntu, làm 5 việc tay installer in ra
- [ ] 🧑 **P0.2** Ba lệnh kiểm ranh giới token — cả ba phải đúng kết quả mong đợi
- [ ] 🧑 **P0.3** `be repo add` — `origin/HEAD` phân giải được (bản vá vừa commit)
- [ ] 🧑 **P0.4** Kill switch cả hai tầng, gồm `.agent/PAUSE` (tầng này chưa từng chạy)
- [ ] 🧑 **P0.5** Khoá template unit, tick không chồng, `be dry-run`

> **✅ Checkpoint 0** — không qua thì không đi tiếp

## P1 · Rule 07 chạy thật

- [ ] 🧑 **P1.1** Một task nhỏ đi hết đường → draft PR
- [ ] 🧑 **P1.2** Bốn task nữa — **3/5 ra PR không can thiệp tay**
- [ ] 🤖 **P1.3** Sửa prompt theo những gì P1.2 học được

> **✅ Checkpoint 1** — agent làm được việc thật

## P2 · Phục hồi, CI, dashboard

- [ ] 🧑 **P2.1** Rút điện giữa chừng → rule 01 dọn; lần hai → `needs-human`
- [ ] 🧑 **P2.2** Rule 03 đẩy `bee/test` lên PR, gồm cả PR do người mở
- [ ] 🧑🤖 **P2.3** Dashboard lên được, và **vẫn lên khi reconciler đã chết**

## P3 · Bằng chứng

- [ ] 🤖 **R3.1** Chuyển sang `/srv/bee/evidence/<slug>/<num>/<sha>/` · đổi mốc scan · bỏ MinIO → *chặn W8*
- [ ] 🤖 **R3.2** Chính sách dọn `evidence/`
- [ ] 🧑 **P3.3** PM duyệt thật bằng video, không cần hỏi ai

## P4 · Vòng feedback

- [ ] 🤖 **R4.1** Rule 02 quét cả comment thường, không đếm trùng → *chặn W7*
- [ ] 🧑 **P4.2** TL comment thật, agent sửa đúng chỗ nhờ `--resume`

> **✅ Checkpoint 2** — reconciler xong M0–M4

## P5 · Web app V1

- [ ] 🤖 **W1** Bộ khung đi được — 4 cổng chất lượng xanh trước khi có code
- [ ] 🤖 **W2** Đăng nhập trọn vẹn · người ngoài allowlist thấy trống · token không lộ ra client
- [ ] 🤖 **W3** Đọc `status.json` · heartbeat cũ báo đỏ · file hỏng không crash
- [ ] 🤖 **W4** Hộp thư "đang chờ bạn" — màn hình chính
- [ ] 🤖 **W5** Trang task — issue + PR thành một trang
- [ ] 🤖 **W6** Tạo task → issue mang tên người tạo
- [ ] 🤖 **W7** Chat vào task *(chờ R4.1)* — không spinner vô tận
- [ ] 🤖 **W8** Xem bằng chứng *(chờ R3.1)* — chặn path traversal
- [ ] 🤖 **W9** PM duyệt bằng token của chính mình
- [ ] 🤖 **W10** Slack — gộp, không spam, không bắn lại
- [ ] 🧑 **W11** Nghiệm thu V1: một tuần không ai mở GitHub Issues

---

## Làm được ngay hôm nay mà không cần máy

Nếu bạn chưa có thời gian ngồi trước máy Ubuntu, ba việc này **không phụ thuộc P0**:

- 🤖 **R3.1** — chuyển bằng chứng, kiểm bằng rig
- 🤖 **R4.1** — mở rộng rule 02, kiểm bằng rig
- 🤖 **W1** — dựng bộ khung web + cổng chất lượng

W2–W6 thì **nên** chờ P1: chúng đọc dữ liệu thật, và dựng UI cho dữ liệu chưa ai
xác nhận là đúng thì sẽ phải sửa lại hai lần.
