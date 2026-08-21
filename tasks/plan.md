# Plan — cập nhật 21/08/2026 · **V1 + V2 ĐÓNG TRỌN, đã chứng minh bằng flow thật**

**Nguồn:** [`docs/specs/session-first.md`](../docs/specs/session-first.md) ·
[`docs/specs/canvas.md`](../docs/specs/canvas.md) · PRD 3.0 ·
checklist chi tiết: [`todo.md`](todo.md) · phát hiện rig: [`FINDINGS.md`](../apps/runner/rig/FINDINGS.md)

## Đã xong — trạng thái thật đến 21/08

- **V1 (20/08)**: runner systemd một-UID · chat skin VSCode · canvas ·
  action chips (Issue→Build→Review→PR→Demo→Preview) · /setup trọn trên web ·
  Tailscale + GitHub OAuth allowlist · install.sh một lệnh · responsive.
- **V2 (20/08), cả 6 mục**: màn duyệt trong app (AC + evidence, merge =
  link GitHub) · canvas sống (state/checks + prefetch) · quản preview trên
  Overview · chips ngữ cảnh · session modes Auto/Plan/Edits/Manual (đổi
  giữa chat; Manual = thẻ ⏸ Allow/Deny qua cờ ẩn `--permission-prompt-tool
  stdio`, rig-05) · Continue phiên đã dừng.
- **Sau V2 (20–21/08)**:
  - *Phương án A*: repo private không render ảnh inline trong PR → trang
    duyệt `/pr/<slug>/<số>` (ảnh + video + AC), skill tự comment link vào PR.
  - *Canvas v3*: container theo repo (group node, kéo cả cụm) · node 🎬
    preview video ngay trên canvas · nút Tidy layout · fix edge PR→demo
    (artifact node thiếu source handle).
  - **Nghiệm thu flow thật trên lifebook** (21/08): MỘT câu lệnh → issue
    #11 (template AC) → build 4 cổng xanh (466 test) → 3 snapshot commit
    `.bee/evidence` → PR #12 draft (Closes #11) → video demo Playwright
    → comment link bee. 55 lượt, 0 lần hỏi tay.

---

## 🧑 Việc tay còn treo (audit lại 21/08 — vẫn nguyên)

1. **Review + merge [PR #12](https://github.com/Anhduchb01/lifebook-assessment/pull/12)**
   từ điện thoại qua https://ducba.tail7d9c45.ts.net/pr/lifebook-assessment/12
   — đây chính là checkpoint sống của cả vòng V2.
2. **PR #10** (terms/privacy) đang có check đỏ (Vercel fail) — xem rồi quyết
   sửa hay đóng; **PR #6 + issue #4 "[task]"** là rác mô hình cũ → nên đóng.
3. PAT: "All repositories" → **"Only select repositories"** (vệ sinh A+ §2).
4. `sudo rm -rf ~/.local/opt/bee` (junk root-owned còn nguyên).
5. Đổi tên Chrome Profile 10 "Your Chrome" → "Claude" (đỡ lẫn khi quay demo).
6. Repo cần Docker: soạn `.bee/preview.sh` qua /setup trước lần bấm Preview đầu.

## 🤖 Nợ tài liệu (làm trước khi mở V3 — spec là hợp đồng)

- Spec session-first chưa ghi: session modes + bảng cờ CLI, thẻ approvals
  (control_request/bee_approval), phương án A (/pr route + evidence trên
  bee), Continue phiên. Spec canvas chưa ghi: container repo, node 🎬,
  Tidy, node demo edge. → một đợt đồng bộ spec ngắn.
- README: bổ sung mục "xem evidence ở đâu" (GitHub = hồ sơ, bee = phòng chiếu).

## V3 — menu, XẾP THEO GIÁ TRỊ (mỗi mục: spec ngắn trước khi code)

```
V3.1 · Vận hành bền ngày-qua-ngày            ← nên làm TRƯỚC
│  run.jsonl trần theo byte khi đang ghi (nợ spec §11 từ V1) ·
│  dọn sau merge: PR merged → xoá worktree + branch bee/* + evidence cũ
│  theo tuổi (máy chạy tháng dài không phình đĩa) · doctor thêm check
│  dung lượng sessions/.
│
V3.2 · Hàng đợi + chế độ đi ngủ (PRD V3)
│  Xếp việc lúc tối, máy tự chạy tuần tự qua đêm theo hạn mức còn lại;
│  sáng dậy có bản tin: phiên nào xong, PR nào chờ duyệt, cái nào kẹt.
│  (Bản tin sáng gộp vào đây — cùng một vòng đời.)
│
V3.3 · Ngân sách hạn mức
│  Trần usage per-phiên/per-ngày, đọc từ oauth usage endpoint đã có;
│  chạm trần → phiên pause + needs_human, không lặng lẽ đốt tuần.
│
V3.4 · Canvas nâng cao (nice-to-have)
│  Lưu vị trí node (localStorage per-browser) · terminal node xterm+PTY
│  (canvas.md §4, sau cùng).
│
V3.5 · Dọn nợ code khi đụng tự nhiên
   types BeeStatus cũ · e2e chup-anh/canh-hong cũ · identifier Việt cũ.
```

## Checkpoint

| Sau | Bạn duyệt gì |
|---|---|
| Ngay bây giờ | Merge PR #12 từ điện thoại — vòng V2 khép sống |
| Đồng bộ spec | Đọc lướt spec đổi gì — spec khớp máy đang chạy |
| V3.1 | Máy chạy 1 tuần không phình đĩa, doctor vẫn xanh |
| V3.2 | Xếp 2 việc buổi tối → sáng có bản tin + PR chờ duyệt |

## Ngoài phạm vi (giữ ranh)

Nút merge in-app (link GitHub là đủ — chốt 20/08) · GitHub App bot ·
repo evidence public · multi-machine.
