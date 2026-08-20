# Plan — cập nhật 20/08/2026 · **V1 NGHIỆM THU XONG**

**Nguồn:** [`docs/specs/session-first.md`](../docs/specs/session-first.md) ·
[`docs/specs/canvas.md`](../docs/specs/canvas.md) · PRD 3.0 ·
checklist chi tiết: [`todo.md`](todo.md)

**V1 đóng 20/08** (chủ dự án xác nhận toàn flow chạy): runner systemd một-UID
· web live chat skin VSCode · canvas + panel issue/PR trong app · action
chips = flow Issue→Build→Review→PR→Demo→Preview · /setup trọn trên web ·
Tailscale (https://ducba.tail7d9c45.ts.net) · GitHub OAuth allowlist ·
install.sh một lệnh dựng đủ · responsive điện thoại.

Việc lặt vặt còn treo (không chặn gì): 🧑 `sudo rm -rf ~/.local/opt/bee` ·
đổi tên Chrome profile "Your Chrome" (Profile 10) → "Claude" · PAT đổi
"All repositories" → "Only select repositories" (vệ sinh A+) · soạn
`.bee/preview.sh` cho repo cần Docker khi dùng Preview lần đầu.

---

## V2 — xếp lại 20/08 sau khi soi tài sản V1 để lại

Nguyên tắc xếp: (1) mục nào V1 đã xây gần xong thì lên đầu — rẻ mà ăn ngay;
(2) mục đụng runner cần rig thì đi riêng, không chặn các mục web.

```
V2.1 · Duyệt & merge PR ngay trong app          ← GỘP 3 mục cũ, làm TRƯỚC
│  Nền V1 đã có: panel chi tiết PR (state/diff/checks/comment) + cache 60s
│  + OAuth login đã mang scope `repo` (auth/index.ts) — token NGƯỜI bấm.
│  Còn thiếu: nút Merge trong panel (gh api bằng token phiên đăng nhập,
│  KHÔNG phải PAT của agent — merge mang tên người), gate checks xanh +
│  confirm; mục Evidence trong panel (đọc sessions/<id>/evidence + ảnh
│  .bee/evidence trên branch); AC của issue liên kết hiện cùng màn.
│  = "màn duyệt 1 phút mobile" của plan cũ, không cần màn riêng.
│
V2.2 · Canvas sống                               ← teo còn việc nhỏ
│  Nền V1: fetchArtifactDetail + cache đã trả state/checks.
│  Còn thiếu: node PR đổi màu theo open/merged/closed + chấm checks;
│  prefetch detail cho node đang hiện → panel mở tức thì lần đầu.
│
V2.3 · Preview + demo quản trên web
│  Nền V1: bee-preview đã tạo unit bee-preview-* + tailscale serve;
│  bee-demo đã ghi evidence/. Còn thiếu: bảng preview đang chạy
│  (systemctl --user list-units bee-preview-*) + nút Stop; link video
│  demo xem được trong app (chung evidence viewer V2.1).
│
V2.4 · Chips theo ngữ cảnh (nhỏ, làm kèm V2.1–V2.3)
│  Chip sáng theo giai đoạn phiên: chưa issue → Issue nổi; có commit →
│  PR nổi; có PR → Update-PR/Preview. Dữ liệu đã có trong run.jsonl.
│
V2.5 · Hook-reply approvals                      ← nặng nhất, rig TRƯỚC
│  Thay dần --dangerously-skip-permissions: permission hook đẩy
│  control_request ra stream → web render thẻ Approve/Deny trong chat →
│  trả lời bơm ngược FIFO. Chính sách: auto-allow trong worktree,
│  hỏi lệnh mạng/ngoài worktree. Đụng runner → rig riêng như S0.
│
V2.6 · Chat lại phiên đã dừng (--resume từ web)
   Runner đã có đường resume nội bộ; thiếu action + nút "Continue" trên
   phiên done/stopped.
```

**Không đổi từ plan cũ:** mọi mục V2 vẫn *spec ngắn trước khi code*; mục
đụng runner (V2.5) bắt buộc rig chứng minh trước khi nối web.

## Checkpoint

| Sau | Bạn duyệt gì |
|---|---|
| V2.1 | Merge một PR thật từ điện thoại, tên bạn đứng ở merge commit |
| V2.5 rig | Bản rig hook-reply chạy được trước khi đụng session-run.sh |

## Ngoài phạm vi (giữ nguyên ranh)

Hàng đợi/đi ngủ (V3) · ngân sách hạn mức · bản tin buổi sáng · lưu vị trí
node canvas · terminal node xterm/PTY · types `BeeStatus` cũ (gỡ khi đụng).
