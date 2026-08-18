# Plan — sau V4 đợt 1+2 (cập nhật 18/08/2026)

**Nguồn:** [`docs/specs/session-first.md`](../docs/specs/session-first.md) ·
[`docs/specs/canvas.md`](../docs/specs/canvas.md) · PRD 3.0
**Đã xong:** S0 (rig) · S1 (runner) · S2–S3 (web live) · S6 (canvas + skin
VSCode + tạo phiên + repo đăng ký) · V4 đợt 1+2 (xoá mô hình cũ, −4.816 dòng).
Web chỉ còn một mô hình: `/` · `/login` · `/projects` · `/p/[slug]` ·
`/t/[slug]/[num]` · `/sessions` · `/sessions/[id]` · `/canvas`.

---

## Điều quyết định thứ tự bây giờ

Code trên fixture đã đi trước phần nghiệm thu rất xa. **Rủi ro lớn nhất còn
lại không nằm trong code — nằm ở chỗ chưa có phiên thật nào chạy trên máy
thật.** Vậy: một đợt đánh bóng UI ngắn (S7, có yêu cầu mới của bạn), trả nợ
test, rồi dồn toàn lực sang S4/S5 — nơi cần tay bạn.

## Đồ thị

```
S7 · Đánh bóng + trả nợ (fixture, 🤖)
├ S7.1 Repo combobox: search NẰM TRONG dropdown        ← yêu cầu 18/08
├ S7.2 Unit test route SSE (nợ spec §8)
└ S7.3 E2E flow phiên trên fixture: mở → chữ chạy → gõ chen → dừng
        │
        ▼
S4 · Máy thật + vệ sinh A+                     ← CỬA NGHIỆM THU THẬT
├ S4.1 🧑 PAT hẹp + branch protection + repos.d
├ S4.2 🧑 install runner · login claude · linger · doctor xanh
└ S4.3 🤖 6 bài rig spec §8 trên máy thật (kill -9, reboot, 2 phiên song song…)
        │
        ▼
S5 · Ra internet
├ S5.1 🤖 OAuth allowlist nghiệm thu với GITHUB_SOURCE=live
├ S5.2 🧑 Cloudflare Access
└ S5.3 🧑 checklist spec §10 từ điện thoại → **V1 XONG**
        │
        ▼
V2 (spec trước khi code)
├ Nút merge (token người bấm — duyetPR đã chờ sẵn, lệnh cấm đã gỡ)
├ Màn duyệt 1 phút mobile (evidence + AC + tóm tắt)
├ Trạng thái PR sống (merged/closed) cho node canvas — lib/github
├ Rig hook-reply approvals (thay dần --dangerously-skip-permissions)
└ Làm lại chat/Ask trên runner phiên (đã xoá bản socket cũ)
```

## S7.1 — Repo combobox (yêu cầu mới, làm đầu tiên)

**Hiện tại:** form New session = `<select>` repo + ô title *bên cạnh* — hai ô
rời. **Đích:** một nút dropdown duy nhất; bấm mở panel có **ô search ngay
trong dropdown**, gõ để lọc repo (tìm không dấu), phím ↑↓ + Enter chọn,
mục "No repo — just chat" ghim cuối. Không còn ô search/select đứng cạnh nhau.

- Cách làm: combobox tự dựng bằng Popover + Input (repo ít, không cần
  virtualize; shadcn Command chưa cài — không thêm dependency).
- Nghiệm thu: mở bằng click + phím; gõ "my" lọc còn `you/myapp`; Esc đóng
  không đổi lựa chọn; hoạt động trong cả `/sessions` lẫn Panel trên `/canvas`;
  test component theo role (combobox/listbox/option); 4 cổng xanh.

## Checkpoint

| Sau | Bạn duyệt gì |
|---|---|
| S7 | Combobox trên fixture + suite xanh — xong là **khoá code fixture**, không thêm tính năng trước S4 |
| S4.3 | 6 bài rig máy thật — nghiệm thu thật đầu tiên của toàn mô hình |
| S5.3 | Từ điện thoại ngoài mạng nhà → tick V1, rồi mới spec V2 |

## Ngoài phạm vi (đừng để lẻn vào trước V2)

Nút merge · hàng đợi/đi ngủ (V3) · types `BeeStatus` cũ trong lib/bee (gỡ khi
đụng tự nhiên) · lưu vị trí node canvas · terminal node xterm/PTY · markdown
trong live view.
