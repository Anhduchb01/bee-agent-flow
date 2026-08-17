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

## S1 · `apps/runner/` — bash ✅ code xong 17/08 (nghiệm thu máy thật = S4)

- [x] 🤖 **S1.1** `session-run.sh` — vòng lặp pha phỏng vấn⇄làm cùng session-id;
      kết thúc pha bằng đóng fd FIFO (không kill). *Lưu ý: `result` KHÔNG phải
      tín hiệu kết thúc — spec §2.2 đã sửa theo.*
- [x] 🤖 **S1.2** `units/` + `install.sh` — user units, PAUSE tạo sẵn, in 8 việc-cần-người.
- [x] 🤖 **S1.3** `reaper.sh` + `heartbeat.sh` — rig-03 offline xanh 9/9
      (id bẩn, PAUSE, xác, attempt, needs_human, FIFO mồ côi, heartbeat).
- [x] 🤖 **S1.4** `doctor.sh` — chạy thử trên máy dev báo đỏ đúng chỗ (token
      `gho_`, SSH key, chưa linger). Ghi `doctor.json`.

> **✅ Checkpoint** — bash đã có rig-03; bạn review lại `session-run.sh` khi rảnh.

## S2 · Web đọc luồng ✅ xong 17/08 — 4 cổng xanh (lint · typecheck · 293 test · build)

- [x] 🤖 **S2.1** `parse-events.ts` (whitelist + text_delta) + `docTiep` (không
      phát nửa dòng) — test trên fixture stream-json THẬT từ rig S0.
- [x] 🤖 **S2.2** `BeeSource` + sessions-fs (unknown-narrowing, meta hỏng không
      làm trắng danh sách) + route SSE (`Last-Event-ID`, `bee_replayed`, đóng
      khi hết running, từ chối id bẩn/không session).
- [x] 🤖 **S2.3** LiveView mobile-first + SessionList nhóm theo repo + sidebar.
      Plain text có test chống HTML injection. Fixture demo stream được từ
      run.jsonl thật.

## S3 · Nối điều khiển ✅ xong 17/08

- [x] 🤖 **S3.1** Actions `batDauPhien`/`guiVaoPhien`/`dungPhienAction` —
      UUID regex trước khi thành tên unit; FIFO mở O_NONBLOCK (phiên chết →
      lỗi ngay, không treo); `bee_user_say` ghi SAU khi FIFO nhận thật.
- [x] 🤖 **S3.2** "OK, do it" → `phase:"work"` → watcher của runner restart
      claude `--resume` đủ tool.
- [x] 🤖 **S3.3** 3 skill `gh` trực tiếp, install.sh copy vào `~/.claude/skills/`.

**Nợ test ghi nhận (làm ở S4 hoặc trước):**
- [ ] 🤖 Unit test riêng cho route SSE (MSW) — logic mỏng, các tầng dưới đã test,
      nhưng spec §8 có hàng Route.
- [ ] 🤖 E2E Playwright cho flow: mở phiên → chữ chạy → gõ chen → dừng (trên fixture).

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
