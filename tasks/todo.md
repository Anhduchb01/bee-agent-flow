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

## S6 · Canvas ✅ xong 17/08 — [spec](../docs/specs/canvas.md)

- [x] 🤖 `bee_artifact` end-to-end: runner export `BEE_SESSION_DIR` → skill ghi
      sau khi `gh` thành công → parse-events (allowlist github.com) → hiện live
      trong dòng sự kiện.
- [x] 🤖 `BeeSource.sessionArtifacts` + `build-graph` thuần (test layout) +
      trang `/canvas` React Flow (MIT — không dính BUSL của nodeterm) + sidebar.
- [x] 🤖 **Panel VSCode-style** (17/08): thẻ tool ghép cặp theo `tool_use.id`
      (`ghep-the.ts` thuần + test fixture thật) — ● → ✓/✗, lỗi tự mở, kết quả
      mồ côi sau replay vẫn hiện; thinking gập, buffer riêng; num_turns.
      Click node phiên trên canvas → Sheet chứa LiveView tại chỗ.
- [x] 🤖 **Dark mặc định + skin VSCode** (17/08): class `dark` ở root; diff
      đỏ/xanh cho Edit/Write (+n −m), khối IN/OUT cho Bash, hộp người full-width,
      ô nhập bo tròn nút ↑ #C15F3C. PRD §5 + spec §4.4 đã cập nhật.
- [x] 🤖 **Tạo phiên trên canvas** (17/08, chốt lại cùng ngày): repo chọn từ
      danh sách ĐÃ ĐĂNG KÝ (repos.d → `listRepos`) hoặc "No repo — just chat";
      không có ô gõ tự do. Phiên có repo LUÔN có worktree từ đầu (hết bài
      nâng cấp chat→work, rig-04 khỏi cần); chat = không repo, không tool,
      nhóm "Chats". Guard 2 lớp: action + runner `unregistered-repo` (rig-03
      §2b). Spec canvas §2 + session-first §3.1.
- [ ] Sau: lưu vị trí node · node evidence · rig hook-reply approvals
      (session-first §11) · terminal node thật (xterm+PTY, sau V2 — canvas.md §4).
- [x] 🤖 **V4 đợt 1+2 (18/08)**: xoá inbox/notify/chat/task-new/spec-chat/task-stage
      + /viec; gỡ lệnh cấm merge; Overview/Projects/Task bỏ queue-slots-nhãn;
      route /projects /login; footer đếm phiên. Nợ còn: types BeeStatus cũ,
      chat/phỏng-vấn nối lại runner mới, e2e chup-anh + canh-hong cần sửa.

## S7 · Đánh bóng + trả nợ (18/08) ← ĐANG LÀM — xong là khoá code fixture

- [x] 🤖 **S7.1** ~~Repo combobox~~ **XONG 18/08** — search NẰM TRONG dropdown
      (`repo-combobox.tsx` tự dựng, không thêm dependency; `matchesQuery` lọc
      không dấu kể cả đ→d; ↑↓ Enter Esc, active bắt đầu ở lựa chọn hiện tại;
      "No repo — just chat" ghim cuối không bị lọc; NewSessionForm dùng chung
      /sessions + Panel canvas; 14 test theo role combobox/listbox/option)
- [x] 🤖 **S7.1b** ~~Auto-title~~ **XONG 18/08** — bỏ ô "What do you want…";
      phiên mở ra chưa có tên (UI fallback slug-num), TIN NHẮN ĐẦU đặt tên như
      Claude Code (`deriveSessionTitle` 60 ký tự cắt theo từ + `autoTitleSession`
      ghi session.json tmp+rename, best-effort không làm hỏng lượt gửi).
- [x] 🤖 **S7.2** ~~Unit test route SSE~~ **XONG 18/08** — 7 bài: 401/400/404,
      replay id=byte offset, bee_replayed + trần 200 dòng, Last-Event-ID không
      lặp dòng, bee_done + đóng khi phiên hết running (docTiep chạy file thật).
- [x] 🤖 **S7.3** ~~E2E fixture~~ **XONG 18/08** — `session-live.spec.ts`: tạo
      từ combobox (search trong dropdown, lọc, chat ghim) → chữ thật từ
      run.jsonl rig chảy qua SSE → gõ chen ô sạch → Stop không nổ. Cả bộ e2e
      38 pass / 0 fail. `E2E_PORT` override để không giết dev server đang chạy.

## S4 · Máy thật + vệ sinh A+

- [x] 🤖 **S4.0** ~~Onboarding trên web~~ **XONG 18/08** — trang `/setup`:
      5 bước cài (lệnh copy-paste theo install.sh) + checklist doctor SỐNG
      (`readDoctor()` disk/fixture, `bee-doctor.service` oneshot + nút
      "Run doctor again" qua systemctl) + danh sách repo đã đăng ký + bước
      cuối nhúng NewSessionForm để test tại chỗ. Link "Setup" trong sidebar.
      Login tự redirect về /setup khi máy chưa verify hoặc doctor đỏ
      (`postLoginTarget`; fixture doctor theo cảnh: binh-thuong xanh,
      co-su-co đỏ+PAUSE, vua-cai null).
- [x] 🤖 **S4.0b** ~~Setup tương tác~~ **XONG 18/08** — hết copy-paste trừ
      install.sh + login claude: nút linger, form dán PAT (stdin, chặn
      classic 2 lớp), đăng ký/gỡ repo trên web (repos.d tmp+rename, chặn
      slug trùng), toggle PAUSE khoá tới khi doctor xanh, mỗi action tự
      chạy lại doctor. Branch protection cố ý để GitHub-side (PAT không
      admin) — có deep-link + doctor kiểm. doctor.sh thêm check claude.
      **Claude cũng qua web**: status sống trên UI (`readClaudeAuth`) +
      "Get login link" — web tự spawn `claude setup-token` dưới PTY
      (`script -qec`), đưa URL thành link, nhận confirmation code dán lại,
      tự ghi claude.env 0600 → session-run.sh export
      CLAUDE_CODE_OAUTH_TOKEN. Fallback dán token thủ công vẫn còn.
      Ở máy chỉ còn đúng install.sh.
- [ ] 🧑 **S4.1** Tạo fine-grained PAT (contents + PR + issues, đúng danh sách
      repo) · bật branch protection `main` từng repo · thử push main phải bị từ chối
      → làm theo trang `/setup`, doctor phải xanh trên đó
- [x] 🤖 **S4.2** ~~Cài runner lên máy~~ **XONG 18/08** — cài thật trên máy
      dev (chủ động chọn, biết may-sach đỏ): `~/.local/opt/bee` +
      `~/.local/srv/bee` (units template hoá vì /opt/bee root-owned còn
      mô hình cũ), linger BẬT, timers active, doctor chạy thật:
      ✓ claude/linger/reaper/dia · ✗ pat(gho_)/repos(trống)/may-sach.
- [~] 🤖 **S4.3** Rig máy thật **6/7 XANH 19/08**: PAUSE gate qua systemd ·
      FIFO→claude thật→reply vào run.jsonl · kill -9 claude→trap đóng
      `failed` ngay · kill -9 session-run→reaper đóng trong 1 tick
      (reason:reaped, attempt:1, FIFO dọn, heartbeat thật) · id bẩn chết ở
      cửa · systemctl stop→`stopped` · web disk-mode boot (/login?next=,
      SSE 401 đúng chỗ) · **rig 3 ✓** (gõ chen giữa Bash sleep 20 — CLI
      đưa vào cùng lượt, trả lời gộp cả hai, không nuốt) · **rig 4 ✓**
      (clone→worktree bee/lifebook-assessment-1 qua PAT thật; đổi pha
      interview→work bằng watcher đóng FIFO; --resume nhớ CHUOI-XANH-99).
      **Bug bắt được nhờ rig**: reaper cướp stop sạch khi unit đang
      deactivating → sửa + rig-03 3b (810a943); install từng rơi nhánh
      sudo ngầm → prefix mới `~/.local/bee` (ducba-owned; `~/.local/opt/bee`
      root-owned còn sót, cần 🧑 `sudo rm -rf` lúc rảnh).
      **Chốt 19/08**: rig 6 reboot — BỎ theo quyết định chủ dự án (đường
      reaper-dọn-xác đã chứng minh bằng kill -9; reboot chỉ thêm niềm tin,
      không thêm đường code). Branch protection: plan Free không bật được
      trên repo private → fence hạ cấp `pre-push-bee` (chặn push ngoài
      bee/* ngay trên máy, đã thử sống: push main bị từ chối), doctor ghi
      rõ trạng thái hạ cấp, trigger nâng lại = repo public/account Pro.
      Doctor giờ chỉ còn ✗ may-sach (máy dev — giá đã chấp nhận).
      **→ S4 ĐÓNG. Tiếp theo: S5.**

## S7b · Live view kiểu VSCode + bỏ phỏng vấn (19/08) ✅

- [x] 🤖 MỘT chế độ: phiên repo = chat đủ tool từ câu đầu, hết interview +
      "OK, do it" (runner bỏ watcher pha, web bỏ nút/label/action; spec §2.3
      viết lại). Chat không repo vẫn không tool.
- [x] 🤖 Nút tròn đổi vai: đang bận + ô trống = Dừng ■, có chữ = Gửi ↑
      (message xếp hàng) · vòng context % từ modelUsage của result · font
      VSCode · panel chat canvas kéo chiều rộng (localStorage).
- [x] 🤖 Skill bee-* giữ GLOBAL (~/.claude/skills) — chốt hỏi 19/08: không
      theo repo, per-repo chỉ khi cần flow đặc thù.

## S8 · Action chips + flow skills (20/08) ✅

- [x] 🤖 6 chip bấm-là-gửi trên ô chat (phiên repo): Issue → Build → Review
      → PR → Demo → Preview — mỗi chip gửi thẳng "/command" qua đúng đường
      expandCommandText, chip chỉ hiện khi command tồn tại trên máy; palette
      "/" bỏ alias cứng, chỉ đọc ~/.claude/commands.
- [x] 🤖 Skill global: bee-create-issue + template (AC bắt buộc),
      bee-push-pr + template PR bằng-chứng-trước (snapshot commit vào
      .bee/evidence/ nhúng blob?raw=true, video để trong session dir),
      bee-demo (Playwright headless / record-screen tab Chrome),
      bee-preview (transient systemd unit + tailscale serve --https=PORT,
      công thức per-repo qua env.d/<slug>/.bee/preview.sh — repo cần Docker
      tự lo trong script, COMPOSE_PROJECT_NAME theo phiên).
- [x] 🤖 Command mới: /issue /pr /demo /preview (+ /build /review sẵn có).
- [x] 🤖 Cài record-screen (soi code trước khi cài — chỉ localhost:9234,
      dep ws+ffmpeg-static). 🧑 còn: load extension vào Chrome một lần.

## S9 · Xem issue/PR ngay trên web (20/08) ✅

- [x] 🤖 Click node issue/PR trên canvas → panel chi tiết TRONG app:
      state/draft/author/branch, +n −m + số file + verdict checks (gộp
      statusCheckRollup: fail > pending > pass), labels, body + comment
      render markdown (react-markdown, HTML thô bị bỏ — nội dung untrusted),
      nút "Open on GitHub ↗" luôn có kể cả khi gh lỗi. ↗ trên node vẫn đi
      thẳng GitHub (stopPropagation).
- [x] 🤖 `fetchArtifactDetail` (lib/bee/artifact-detail.ts): allowlist
      trước exec — repo regex + PHẢI có trong repos.d, kind/number kiểm
      kiểu; `gh issue|pr view --json` qua runGh tiêm được (test không cần
      gh thật); lỗi là dữ liệu. Fixture trả staged detail cho demo/e2e.

## S5 · Ra internet

- [x] 🤖 **S5.0** ~~Web thành service~~ **XONG 19/08** — `bee-web.service`
      (install.sh render node+server.js, sống qua reboot nhờ linger) +
      `web.env` một-file-config mặc định disk-mode 127.0.0.1:3210; khối
      live-auth để sẵn dạng comment. Rig-03 case 5. Đang active trên máy.
- [x] 🧑→🤖 **S5.1** ~~OAuth app + khối live web.env~~ **XONG 19/08** —
      GITHUB_SOURCE=live, login GitHub thật chạy (chủ dự án xác nhận bằng
      màn hình), ALLOWED_LOGINS=Anhduchb01.
- [x] 🤖 **S5.2** ~~Cloudflare Tunnel~~ → **TAILSCALE, XONG 20/08** (đổi
      hướng sau khi cân rủi ro: tailnet riêng, không mở cổng ra internet
      công cộng, TLS tự cấp cho `ducba.tail7d9c45.ts.net`). Đã làm:
      `tailscale up` + app iPhone cùng account (🧑), `tailscale serve --bg
      3210` → https://ducba.tail7d9c45.ts.net proxy 127.0.0.1:3210,
      `AUTH_URL` trong web.env trỏ URL ts.net, restart bee-web — probe
      /login + /api/auth/providers trả callback ts.net đúng. Còn MỘT việc
      🧑: đổi Homepage + Authorization callback của GitHub OAuth app sang
      URL ts.net (OAuth app chỉ nhận một callback → từ giờ dùng thống nhất
      URL ts.net trên mọi thiết bị, kể cả máy này).
- [x] 🧑 **S5.3** ~~Nghiệm thu từ điện thoại~~ **XONG 20/08** — chủ dự án
      xác nhận "toàn flow V1 đã ok". **→ V1 ĐÓNG. V2 xếp lại trong
      plan.md (V2.1 duyệt & merge trong app đi trước — nền đã có sẵn từ
      panel PR + OAuth scope repo).**

---

## Treo — không thuộc V1, đừng quên

- [ ] V4: gỡ cầu socket, rule 07/08, hộp thư 5 loại, hai user thừa; đồng bộ
      `architecture.html`, `AGENTS.md`, `README.md` về mô hình mới
- [ ] `docs/architecture.html` hiện mô tả mô hình hai UID — đã ghi chú trong
      PRD 3.0 phụ lục là *tham chiếu fallback*; vẽ lại sau khi V1 nghiệm thu
- [ ] Trần `run.jsonl` theo byte lúc đang ghi (spec §11)
