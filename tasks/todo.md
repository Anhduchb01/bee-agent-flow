# TODO

Chi tiết ở [`plan.md`](plan.md). 🧑 = chỉ người làm được · 🤖 = tôi làm được

**Mốc đang làm:** V1 Sessions Live — [`docs/specs/session-first.md`](../docs/specs/session-first.md)
**Thứ tự:** gỡ ẩn số (S0) → runner ∥ web (S1 ∥ S2) → nối (S3) → máy thật (S4) → internet (S5)

---

## S0 · Gỡ hai ẩn số ← làm trước mọi thứ

- [x] 🤖 **S0.1** ~~Rig `stream-json` hai chiều~~ **XONG 17/08 — CLI XẾP HÀNG**,
      ô gõ được hứa "agent sẽ đọc". Phát hiện phụ: input không được echo →
      `say` phải tự ghi `bee_user_say` vào run.jsonl (đã vào spec §2.2).
- [x] 🤖 **S0.2** ~~Rig phỏng vấn → resume với tool~~ **XONG 17/08 — NHỚ NGỮ
      CẢNH**, một-phiên-hai-chế-độ đứng vững.
      → 3 fixture thật ở `apps/runner/rig/fixtures/` cho S2. Chi tiết:
      [`apps/runner/rig/FINDINGS.md`](../apps/runner/rig/FINDINGS.md)

## S1 · `apps/runner/` — bash ← song song với S2

- [ ] 🤖 **S1.1** `session-run.sh`: đọc `session.json` → PAUSE check → fetch →
      branch `bee/<slug>-<n>` → worktree → sự kiện vòng đời → claude FIFO/run.jsonl
      → thấy `result` thì đóng FIFO, ghi `meta.json`. Port từ `agent-exec.sh` cũ.
- [ ] 🤖 **S1.2** `units/` + install.sh: `bee-session@.service` (user unit),
      linger, timer. Installer idempotent, tạo sẵn PAUSE như installer cũ.
- [ ] 🤖 **S1.3** `reaper.sh`: `meta.json` running ∧ unit không active → đóng sổ
      `failed`, dọn FIFO, `attempt`; ≥ 2 → `needs_human`. + heartbeat.
- [ ] 🤖 **S1.4** `doctor.sh`: checklist A+ (PRD §4.2) — PAT hẹp, branch
      protection, không secret lạ, linger, timer. Ghi `doctor.json` cho web đọc.

> **✅ Checkpoint** — review riêng phần bash trước khi đi tiếp.

## S2 · Web đọc luồng ← không cần máy Ubuntu

- [ ] 🤖 **S2.1** `features/sessions/lib/parse-events.ts` — thuần, fixture từ S0,
      khoan dung dòng rác · **dòng JSON cắt đôi không phát nửa dòng**
- [ ] 🤖 **S2.2** Route SSE `api/session/[id]/stream` — `Last-Event-ID` ·
      `bee_replayed` · đóng khi phiên xong · từ chối `../` và thiếu session
- [ ] 🤖 **S2.3** Màn live (plain text, mobile-first, mất mạng không xoá màn) +
      **session list nhóm theo repo** — màn hình gốc mới của app

> **✅ Checkpoint** — bạn duyệt bố cục trên fixture.

## S3 · Nối điều khiển

- [ ] 🤖 **S3.1** Server actions `start`/`say`/`stop`: ghi `session.json` +
      `systemctl --user` + ghi FIFO. Id qua regex UUID trước khi thành tên unit.
- [ ] 🤖 **S3.2** "Ok làm đi": một nút → `phase:"work"` → runner restart claude
      `--resume` với đủ tool. Cùng session-id, cùng màn hình.
- [ ] 🤖 **S3.3** Skills `bee-create-issue` · `bee-push-pr` · `bee-update-pr`
      (`gh` trực tiếp; push-pr từ chối branch ≠ `bee/*`)

## S4 · Máy thật + vệ sinh A+

- [ ] 🧑 **S4.1** Tạo fine-grained PAT (contents + PR + issues, đúng danh sách
      repo) · bật branch protection `main` từng repo · thử push main phải bị từ chối
- [ ] 🧑 **S4.2** Cài `apps/runner` lên máy · login Claude dưới user `bee` ·
      `loginctl enable-linger bee` · `doctor.sh` xanh toàn bộ
- [ ] 🤖 **S4.3** Chạy 6 bài rig của spec §8 trên máy thật — nghiệm thu thật

## S5 · Ra internet

- [ ] 🤖 **S5.1** GitHub OAuth + allowlist login; ngoài allowlist thấy trang
      trống nói thẳng, không lộ dữ liệu
- [ ] 🧑 **S5.2** Cloudflare Access trước app
- [ ] 🧑 **S5.3** Nghiệm thu toàn bộ checklist spec §10 **từ điện thoại, ngoài
      mạng nhà** → V1 xong

---

## Treo — không thuộc V1, đừng quên

- [ ] V4: gỡ cầu socket, rule 07/08, hộp thư 5 loại, hai user thừa; đồng bộ
      `architecture.html`, `AGENTS.md`, `README.md` về mô hình mới
- [ ] `docs/architecture.html` hiện mô tả mô hình hai UID — đã ghi chú trong
      PRD 3.0 phụ lục là *tham chiếu fallback*; vẽ lại sau khi V1 nghiệm thu
- [ ] Trần `run.jsonl` theo byte lúc đang ghi (spec §11)
