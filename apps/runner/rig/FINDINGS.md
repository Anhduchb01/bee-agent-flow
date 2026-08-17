# Kết quả rig S0 — hai ẩn số đã gỡ

Chạy 17/08/2026 · `claude 2.1.161` · máy dev (không phải máy Ubuntu đích, nhưng
hành vi CLI không phụ thuộc máy). Log gốc: `fixtures/`.

## S0.1 — Gõ chen giữa tool call: **CLI XẾP HÀNG** ✅

Chuỗi sự kiện thật (rút gọn từ [`fixtures/fixture-interject.jsonl`](fixtures/fixture-interject.jsonl)):

```
assistant  tool_use = Bash("sleep 8 && echo xong")
   ← gõ chen qua FIFO tại giây thứ ~3 của sleep: "nhắc lại mã hiệu XOAI-XANH"
user       tool_result = "xong"
assistant  text = "XOAI-XANH — lệnh đã chạy xong, output: `xong`."
```

Message gõ chen lúc agent đang giữa một tool call **không bị bỏ**: nó được xếp
hàng và tiếp thu ngay trong lượt trả lời sau khi tool xong. **Ô gõ được phép
hứa "agent sẽ đọc"** — thiết kế §4.4 của spec đứng vững.

### Phát hiện phụ 1 — quan trọng cho spec

**Message gõ chen KHÔNG được echo lại trong stream đầu ra.** Trong
`run.jsonl` không có sự kiện `user` nào cho câu đã gõ (sự kiện `user` duy nhất
là `tool_result`). Hệ quả: nếu chỉ tail `run.jsonl`, mở lại trang sẽ **mất
sạch những câu người dùng đã gõ chen**. → Server action `say` phải tự append
một dòng `{"type":"bee_user_say", "text":…, "ts":…}` vào `run.jsonl` (O_APPEND,
dòng ngắn — append nguyên tử) ngay khi ghi FIFO. Đã đưa vào spec §2.2.

### Phát hiện phụ 2

Stream thật chứa nhiều loại sự kiện ngoài tài liệu: `system/hook_started`,
`system/thinking_tokens`, `system/task_started`, `rate_limit_event`,
`stream_event` (partial). `parse-events.ts` phải whitelist loại nó hiểu và
**bỏ qua êm** phần còn lại — fixture này là bộ test tự nhiên.

## S0.2 — Phỏng vấn không tool → `--resume` với tool: **NHỚ NGỮ CẢNH** ✅

- Pha 1 (`--allowedTools ""`): chốt hợp đồng "tạo `hopdong-rig.txt` chứa
  `DUA-HAU-77`" — agent chỉ xác nhận, không làm được gì.
- Pha 2 (`--resume <session-id> --allowedTools "Write Bash"`), chỉ nói đúng
  một câu *"Ok làm đi — thực hiện đúng hợp đồng đã chốt"*, **không nhắc lại
  nội dung**: agent dùng `Write` tạo đúng file, đúng mã hiệu.

→ Thiết kế **"một phiên hai chế độ"** (spec §2.3) khả thi bằng đường
restart + `--resume`. Không cần bàn giao hợp đồng thủ công giữa hai pha.

## Trạng thái fixture

| File | Là gì | Ghi chú |
|---|---|---|
| `fixture-interject.jsonl` | Phiên có tool_use + gõ chen + partial messages | **Không có sự kiện `result`** — rig kill sớm khi thấy mã hiệu. Dùng test "phiên đang chạy" |
| `fixture-resume-work.jsonl` | Phiên resume, có `tool_use` Write + `result` | Fixture "phiên trọn vẹn" |
| `fixture-interview.jsonl` | Phiên không tool, chỉ text + `result` | Fixture chế độ phỏng vấn |
