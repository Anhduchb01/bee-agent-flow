# TODO

Chi tiết ở [`plan.md`](plan.md). 🧑 = chỉ người làm được · 🤖 = tôi làm được

**Mốc đang làm:** V3 — vận hành bền + tự chạy đêm (PRD Epic 5 + FR-3.3/3.4)
**Thứ tự:** quyết định (D1/D2) → dọn đĩa (P1) → hạn mức + phanh (P2) →
hàng đợi (P3) → bản tin sáng (P4) → nợ nhỏ (P5)

---

## D · Quyết định — chặn code, không code được thay

- [x] 🧑 **D1** ~~Cò súng #4 đã nổ~~ **CHỐT 24/08: (a) chấp nhận có ý thức.**
      Ghi vào PRD §0.2 + [`docs/mo-hinh-c.md`](../docs/mo-hinh-c.md) (mô hình C
      là gì, quay về thế nào). Phase 3 mở khoá. `doctor` giữ mục đỏ `may-sach`.
      Cách siết rẻ nhất nếu đổi ý: tách bee sang VM/LXC riêng.
- [x] 🧑 **D2** ~~Cách chạy hàng đợi~~ **CHỐT 24/08**: timer gọi
      `/api/queue/tick` của web — một bản duy nhất của "mở phiên".
- [x] 🧑 **D3** ~~Chính sách dọn~~ **CHỐT 24/08**: xoá worktree khi *đã kết thúc
      ∧ không needs_human ∧ quá 24h ∧ nhánh đã merged hoặc đã push hết*.
      Evidence + run.jsonl không bị đụng (nằm ở `sessions/<id>/`).
- [x] 🧑 **D4** ~~Hàng đợi là lane hay khối riêng~~ **CHỐT 24/08**: lane thứ năm
      **Autopilot** (không dùng tên "Auto" — trùng mode quyền). Kéo thả chỉ
      Backlog ↔ Autopilot; ba lane kia là hệ quả của sự thật nên không cho thả.
      HTML5 DnD gốc trên desktop, `+`/`↑↓` trên điện thoại.
- [x] 🧑 **D5** ~~Hàng đợi sống thế nào~~ **CHỐT 24/08**: luôn sống (nút ⏸) ·
      chỉ nhận issue · xong vẫn ở lại · issue chờ chạy hiện node mờ trên canvas.

## P1 · Vận hành bền — thu hồi 3.0GB đang chiếm

- [x] 🤖 **T0** ~~Sửa `git worktree add -B`~~ **XONG 24/08** — tách
      `dung_worktree()` vào `lib/common.sh` (rig gọi đúng code chạy thật), nhánh
      đã có thì checkout thay vì `-B`, thêm `worktree prune` cho ca bị `rm -rf`.
      `rig-06-worktree.sh` đỏ 4/5 trước khi sửa, xanh 5/5 sau. **Phát hiện kèm
      cho T1:** bare clone chỉ fetch nhánh mặc định nên KHÔNG có ref
      `origin/bee/*` — muốn biết "đã push hết chưa" phải `git ls-remote`, không
      so được bằng ref cục bộ.
- [x] 🤖 **T1** ~~`gc.sh` + `bee-gc.timer`~~ **XONG 24/08 (code), CHƯA thu hồi
      được byte nào trên máy thật** — luật bảo thủ đang chặn đúng: 5/6 worktree
      giữ vì `ls-remote` trả *"Repository not found"* (gh đang active sai tài
      khoản `ducba01`), 1 cái vì mới dừng <24h. Sửa `gh auth switch --user
      Anhduchb01` là gc thu hồi được ngay. rig-07: 11/11.
      *(Dọn docker để T15 — hiện chưa phiên nào đẻ ra compose project.)*
- [ ] 🤖 ~~**T1** `gc.sh` + `bee-gc.timer` (M)~~ — AC: thu hồi ≥2.9GB trên máy thật ·
      không đụng phiên `running`/`needs_human` · branch chưa merged được giữ ·
      chạy lại là no-op. Rig trước khi bật timer.
- [x] 🤖 **T2** ~~doctor thấy đĩa~~ **XONG 24/08** — check `dia-phien`: dung lượng
      work+sessions · worktree mồ côi · tuổi `gc.json` (>48h = gc chết im lặng →
      đỏ) · vượt `GC_WARN_GB` → đỏ. rig-08: 6/6. Máy thật: *796M · 0 mồ côi ·
      gc chạy 0h trước*.
- [x] 🤖 **T3** ~~`/setup`: dung lượng + nút "Dọn ngay"~~ **XONG 24/08** — panel
      đọc `gc.json`, hiện đã thu hồi bao nhiêu và **lý do GIỮ từng worktree**
      (phần đáng giá hơn con số), nút gọi `bee-gc.service` oneshot. 10 test mới.
- [ ] ✅ **Checkpoint 1** — chạy 3 ngày, đĩa không phình, doctor xanh (trừ D1).

## P2 · Hạn mức tươi + phanh (FR-3.3 P0 · FR-3.4 P1)

- [x] 🤖 **T4** ~~Hạn mức tự làm mới~~ **XONG 24/08** — `bee-tick.timer` (30 phút)
      gọi `POST /api/tick` (D2b: timer là đồng hồ, chính sách ở TS). Token
      `BEE_TICK_TOKEN` trong web.env do install.sh sinh, so sánh timing-safe,
      thiếu token thì route đóng hẳn (503). Hai nửa quota/harvest độc lập.
- [x] 🤖 **T5** ~~Phanh trước khi cạn~~ **XONG 24/08** — `xetHanMuc()` thuần (8
      test bảng) + chốt ở `moPhien` (chỗ DUY NHẤT mọi phiên mới đi qua, kể cả
      hàng đợi đêm sau này). Số cũ >3h: fail-open nhưng nói rõ đang bay mù; cũ
      MÀ đã quá ngưỡng thì vẫn phanh. `Continue` không bị chặn.
- [x] 🤖 **T6** ~~Trần chi một phiên~~ **XONG 24/08** — reaper đọc dòng `result`
      cuối trong run.jsonl (`total_cost_usd` CỘNG DỒN — đo trên máy: 1.02→5.60),
      vượt `SESSION_MAX_USD` thì ghi lifecycle + `needs_human` **rồi mới** dừng
      unit. Mặc định 0 = tắt. rig-09: 8/8.
- [ ] ✅ **Checkpoint 2** — ép quota trên ngưỡng: chặn đúng, lý do đọc được trên
      điện thoại; dưới ngưỡng không phiền.

## P3 · Hàng đợi + đi ngủ (FR-5.1 P0 · FR-5.2 P1) — **cần D1**

- [x] 🤖 **T7** ~~`queue.json` + lib thuần~~ **XONG 24/08** — thêm/bỏ/đổi thứ tự/
      việc-kế-tiếp (9 test bảng) + lớp đĩa ghi nguyên tử (6 test). Khoá là
      (repo, issue) nên cùng số ở hai repo là hai việc. `status` lạ về
      `waiting` — dữ liệu ngoài luồng không được lái vòng lặp tick.
- [x] 🤖 **T8** ~~Tick tự mở phiên~~ **XONG 24/08** — `chayMotNhip()` nhận mọi
      tác dụng phụ qua tham số nên vòng chạy-đêm test được trên bàn giấy (7
      test). Mỗi nhịp mở **nhiều nhất một** phiên. Bốn lý do từ chối tách bạch:
      PAUSE máy · ⏸ hàng đợi · hết slot · phanh hạn mức. Phanh chặn thì việc về
      lại `waiting` kèm lý do, không mất và không kẹt `running`.
- [x] 🤖 **T9** ~~Lane **Autopilot**~~ **XONG 24/08** — lane thứ năm giữa Backlog
      và In session; kéo thả chỉ Backlog↔Autopilot (thả vào lane khác bị từ chối
      kèm lý do — chúng là hệ quả của sự thật); `+`/`↑↓` cỡ 36px cho điện thoại;
      lý do phanh hiện ngay trên thẻ. Ý định KHÔNG che sự thật: issue vừa xếp
      hàng vừa có phiên chạy thì lane là *In session*.
- [x] 🤖 **T9b** ~~Node "chờ tự chạy" trên canvas~~ **XONG 24/08** — node riêng
      `cho-chay`, viền đứt + mờ + nhãn ⏳, nằm trong group repo. Cố ý KHÔNG giả
      dạng node phiên: vẽ một dự định trông như việc đã xảy ra là nói dối bằng
      đồ hoạ. Chạy rồi thì node phiên thật thay chỗ.
- [ ] ✅ **Checkpoint 3 — nghiệm thu V3**: tối xếp 2 việc → **sáng có 2 PR chờ
      duyệt**, 0 lần hỏi tay, hạn mức không cháy giữa đêm.

## P4 · Bản tin sáng (FR-5.3 P1)

- [x] 🤖 **T10** ~~Tổng hợp đêm qua~~ **XONG 24/08** — `dungBanTin()` thuần (7 test).
      Ba loại đêm là một trường riêng, không bắt UI đoán từ mảng rỗng:
      *không-xếp-việc* · *xếp-mà-không-chạy* · *có-việc* (PRD §4.1). Mỗi việc kẹt
      bắt buộc mang một câu vì-sao; thiếu `reason` thì suy từ trạng thái.
- [x] 🤖 **T11** ~~Lối vào bản tin~~ **XONG 24/08** — trang `/brief` ("Đêm qua"),
      thứ tự: chờ-bạn-duyệt → kẹt → đã chạy → còn chờ; mục sidebar riêng.

## P4b · Nền cho docker (làm cùng lúc tách user)

- [ ] 🧑 **M1** Tách bee sang user riêng theo [`docs/tach-user.md`](../docs/tach-user.md)
      — tạo user (không sudo/không docker group) · vá `hidepid` · dọn rác mô
      hình C (`bee-orch` đang trong group docker!) · `gh` đăng nhập đúng
      `Anhduchb01` bằng PAT hẹp · rootless docker · deploy · tailscale serve.
      Nghiệm thu: `docker run -v /home/ducba:/h alpine ls /h` → Permission denied.
- [ ] 🤖 **T14** `.env` per-phiên + cấp dải 10 cổng trống (M) — chặn mọi repo
      dùng compose; ecvision đã tham số hoá `${POSTGRES_PORT:-5432}` nên chỉ
      cần file `.env`.
- [ ] 🤖 **T15** Cấp lát dịch vụ cho phiên (M) — database + **role riêng**,
      vhost, bucket; gc thu hồi.

## P5 · Nợ nhỏ

- [ ] 🤖 **T12** Trần `run.jsonl` theo byte (nợ spec §11, S) — cắt thì ghi
      `bee_truncated` để UI nói thật.
- [ ] 🧑 **T13a** `sudo rm -rf ~/.local/opt/bee` — junk root-owned **vẫn còn**.
- [ ] 🧑 **T13b** PAT "All repositories" → "Only select repositories" (vệ sinh A+ §2).
- [ ] 🧑 **T13c** PAT hiện **không đọc được** `Anhduchb01/lifebook-assessment`
      (`gh` trả *Could not resolve to a Repository*) — kiểm tên repo/quyền:
      bảng dự án đang im lặng bỏ qua repo không đọc được.

## Treo — có lý do, không phải quên

- [ ] **FR-5.4 mở khoá dần theo repo** — mode per-phiên + PAUSE + phanh đã phủ
      phần lớn. Treo tới khi chạy đêm thật rồi mới biết còn thiếu gì.
- [ ] **Auto-compact trong `-p`** (spec §11) — chưa quan sát được lần nào; đường
      may `⇅` đã có để đo. Phiên đêm dài là lúc nó lộ ra.
- [ ] **V4** — xoá nhánh fallback hai UID, đồng bộ `AGENTS.md`/`README.md`.
- [ ] Canvas nâng cao: lưu vị trí node, terminal node xterm+PTY (canvas.md §4).

---

# Lưu trữ — nhật ký V1 (S0–S5), đóng 20/08

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

## V2.5a · Session modes (20/08) ✅ + 2 fix phản hồi chat

- [x] 🤖 Mode mỗi phiên như menu VSCode: Auto (skip-permissions, mặc định) /
      Plan (--permission-mode plan) / Edits (acceptEdits) — chọn lúc tạo
      (NewSessionForm) + đổi giữa chat (select trên thanh trạng thái,
      optimistic, doiModePhien ghi session.json tmp+rename rồi restart
      unit CHỈ KHI đang active → --resume giữ hội thoại). Phiên chat không
      mode. Rig-03 case 7: stub claude ghi argv — cờ thật tới exec, thiếu
      mode = auto. Manual để V2.5b (cần hook-reply).
- [x] 🤖 Shimmer "đang làm" kiểu VSCode (✳ + từ xoay 2.5s) khi agent nợ câu
      trả lời mà chưa có gì stream — hết cảnh giây đầu nhìn như chết.
- [x] 🤖 Ring context nói rõ số: "10% · 105k/1M" — kiểm số thật: 104,635
      token / cửa sổ 1,000,000 (model claude-fable-5[1m]) → 10% là ĐÚNG,
      chỉ là màn hình câm. dungToken/cuaSoToken vào sự kiện ket-qua.

## V2 đợt 1 (20/08) ✅ — V2.1→V2.4 + mode menu cạnh nút gửi

- [x] 🤖 Mode menu dời xuống cạnh nút gửi đúng kiểu VSCode: "⚡ Auto" mở
      panel lên trên, mỗi mode có mô tả + dấu ✓.
- [x] 🤖 **V2.1** Màn duyệt 1 phút trong panel PR: AC của issue "Closes #N"
      tự kéo vào (mở sẵn) + Evidence của phiên đẻ ra PR (ảnh inline, video
      phát được) qua route /api/evidence dạng session/<id>/<file> — dùng
      lại resolveEvidencePath, 2 chốt giữ nguyên. Merge = link GitHub.
- [x] 🤖 **V2.2** Node artifact sống: merged tím / closed đỏ (PR) xám
      (issue) / draft xám / open xanh + glyph checks ✓✗●; fetch ≤12
      node, theo nhịp đổi đồ thị + 60s (khớp TTL cache server) — kiêm
      prefetch nên panel mở nóng.
- [x] 🤖 **V2.3** Card "Live previews" trên Overview: đọc dòng bee_preview
      trong run.jsonl, lọc unit còn active (regex allowlist trước argv),
      link mở tab + nút Stop (systemctl stop + tailscale serve off).
- [x] 🤖 **V2.4** Chip bước-kế-tiếp phát sáng: chưa issue → Issue; có issue
      → Build; có PR → Preview (đọc từ bee_artifact trong stream).

## V2 đợt 2 (20/08) ✅ — V2.5b Manual mode + V2.6 Continue

- [x] 🤖 **Rig-05** (online, claude thật): tìm ra cờ ẨN
      `--permission-prompt-tool stdio` — không có nó CLI không phát
      can_use_tool (model còn "diễn" output echo thay vì gọi tool);
      allow qua FIFO → tool chạy thật; deny → bị chặn +
      result.permission_denials ghi nhận. FINDINGS.md có đủ hình dạng JSON.
- [x] 🤖 **V2.5b** Mode Manual vào menu (icon ✋): runner map default +
      prompt-tool stdio (edits cũng thêm prompt-tool — tool ngoài sửa file
      hỏi thay vì chết im; rig-03 case 7 phủ cả 4 mode); parse-events đọc
      control_request/bee_approval; thẻ ⏸ Permission trong chat với
      Allow/Deny (deny gửi lý do cho model); traLoiQuyen ghi
      control_response vào FIFO TRƯỚC, bee_approval vào run.jsonl SAU —
      replay giữ trạng thái thẻ; shimmer tắt khi bóng đang ở chân người.
- [x] 🤖 **V2.6** Nút "Continue session" trên phiên đã done/stopped —
      start unit (idempotent) → --resume nối đúng hội thoại, reload gắn
      lại SSE.

## Phương án A — evidence xem trên bee (21/08) ✅

- [x] 🤖 Chẩn bệnh: repo PRIVATE thì GitHub không render ảnh blob inline
      trong PR (camo không đọc được private blob) — link bấm vẫn xem được.
- [x] 🤖 Route `/pr/[slug]/[number]`: màn duyệt full-page (ArtifactPanel) có
      URL — từ GitHub một chạm sang bee xem ảnh inline + video phát được +
      AC của issue liên kết.
- [x] 🤖 Skill bee-push-pr: snapshot copy thêm vào $BEE_SESSION_DIR/evidence
      (panel tự hiện) + sau khi mở PR tự comment "📎 Review on bee: 
      https://<tailnet>/pr/<slug>/<num>" (best-effort khi có tailscale).
- [x] 🤖 Node 🎬 demo trên canvas: phiên có video trong evidence → node gắn
      vào node PR (chưa có PR thì gắn vào phiên), click mở video tab mới
      (url /api/evidence cùng origin, có auth).
- [x] 🤖 Retro-fix PR #12 lifebook: copy 3 PNG vào evidence phiên + comment
      link bee — giờ mở https://ducba.tail7d9c45.ts.net/pr/lifebook-assessment/12
      là thấy đủ ảnh + video.

## Canvas v3 (21/08) ✅ — container repo + preview video tại chỗ

- [x] 🤖 Node 🎬 click → Sheet phát video NGAY TRÊN canvas (autoplay,
      controls, link raw ↗) — không rời đồ thị; dây vẫn nối từ node PR.
- [x] 🤖 Container theo repo: group node React Flow — phiên/artifact/demo
      là con (parentId + extent:"parent", toạ độ tương đối), kéo container
      cả cụm đi theo, kích thước tự tính theo thứ xa phải nhất; group đứng
      trước con trong mảng (React Flow bắt buộc). Bỏ nhãn repo rời.
- [x] 🤖 Nút "⌗ Tidy layout" góc phải: rebuild từ auto-layout — kéo rối
      tay một nút là gọn lại (vị trí vốn không lưu, spec canvas §2).
- [x] 🤖 Kiểm trên DỮ LIỆU THẬT (disk mode + dev login): 2 container,
      node demo nối PR #12, video Lifebook phát trong Sheet.

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
