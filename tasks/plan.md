# Plan — cập nhật 20/08/2026

**Nguồn:** [`docs/specs/session-first.md`](../docs/specs/session-first.md) ·
[`docs/specs/canvas.md`](../docs/specs/canvas.md) · PRD 3.0 ·
checklist chi tiết: [`todo.md`](todo.md)

**Đã xong:** S0 rig · S1 runner · S2–S3 web live · S6 canvas · S7 đánh bóng
(combobox, auto-title, SSE test, e2e) · S7b một-chế-độ + skin VSCode ·
S4 máy thật (install templated, doctor, pre-push fence, env.d overlay) ·
S5.0 bee-web service · S5.1 GitHub OAuth live · S5.2 Tailscale
(https://ducba.tail7d9c45.ts.net) · S8 action chips + flow skills
(issue/PR template, bee-demo, bee-preview, record-screen vendored) ·
responsive điện thoại toàn màn · xem chi tiết issue/PR ngay trên web.

---

## Đồ thị — còn lại để đóng V1

```
S5 · Ra internet (một việc tay + một buổi nghiệm thu)
├ 🧑 Đổi GitHub OAuth app: Homepage + callback → URL ts.net
│    (OAuth app chỉ nhận MỘT callback — từ đó mọi thiết bị dùng URL ts.net)
└ 🧑 S5.3 checklist spec §10 từ điện thoại (4G + app Tailscale bật)
         → mở app → login → mở phiên → chữ chạy → gõ chen → Stop
         → **V1 XONG**
```

Việc lặt vặt còn treo (không chặn V1): 🧑 `sudo rm -rf ~/.local/opt/bee`
(rác root-owned của lần cài hụt) · đặt tên lại Chrome profile chứa
extension record-screen thành "Claude" (hiện là Profile 10 "Your Chrome") ·
soạn `.bee/preview.sh` cho repo cần Docker (khi dùng chip Preview lần đầu).

## V2 — spec trước khi code, theo thứ tự đề xuất

```
├ Nút merge trên web (token NGƯỜI bấm — không bao giờ là agent)
├ Màn duyệt 1 phút mobile: evidence + AC + tóm tắt + merge trong một màn
├ Trạng thái PR sống trên canvas (merged/closed đổi màu node — gh poll nhẹ)
├ Hook-reply approvals: thẻ Approve/Deny trong chat (control_request qua
│   stream → FIFO), thay dần --dangerously-skip-permissions
├ Evidence viewer trong app: xem screenshot/video từ sessions/<id>/evidence
├ Preview quản trên web: bảng preview đang chạy + nút stop (giờ là lệnh)
└ Chat/Ask lại trên phiên đã dừng (--resume từ web)
```

## Checkpoint

| Sau | Bạn duyệt gì |
|---|---|
| S5.3 | Toàn flow từ điện thoại ngoài mạng nhà → tick V1, rồi mới spec V2 |
| V2 từng mục | Mỗi mục một spec ngắn + rig nếu đụng runner |

## Ngoài phạm vi (đừng để lẻn vào trước lúc V2 có spec)

Hàng đợi/đi ngủ (V3) · ngân sách hạn mức · bản tin buổi sáng · types
`BeeStatus` cũ trong lib/bee (gỡ khi đụng tự nhiên) · lưu vị trí node
canvas · terminal node xterm/PTY.
