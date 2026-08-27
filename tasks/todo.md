# TODO

Chi tiết ở [`plan.md`](plan.md). 🧑 = chỉ người làm được · 🤖 = tôi làm được

**Mốc đang làm:** V3 — vận hành bền + tự chạy đêm (PRD Epic 5 + FR-3.3/3.4)
**Trạng thái 26/08 (cuối ngày):** **M2 XONG — máy đã LIVE.** Trong ngày đã
làm: T18–T20 (nợ cũ) · T23–T25 (ba thứ nói dối im lặng) · T26–T29 (Run now,
Activity, dọn tiếng Việt UI, theme Dark Modern) · **T15 trọn bộ** (spec →
b1–b6 → c1–c5) · T30 (dọn ngôn ngữ code).

**Nhưng vẫn chưa phiên thật nào chạy**, nên cả ba Checkpoint chưa đo được gì —
đồng hồ Checkpoint 1 tính từ phiên đầu tiên, không phải từ lúc gỡ PAUSE. Và
T15 chưa nghiệm thu trên pool thật (rig với stub docker chứng minh được luật,
không chứng minh psql thật chấp nhận đúng câu lệnh đó).

**Hai việc kế tiếp, cả hai đều nhỏ:**
1. `deploy.sh` để lấy T15 + theme + Run now lên máy.
2. Xếp MỘT issue vào Autopilot rồi bấm **Run now** giữa ban ngày — lần đầu
   chuỗi clone → worktree → fence → `gh` → PR chạy trên user `bee`. Chạy lúc
   có người nhìn rẻ hơn nhiều so với lúc 2 giờ sáng.

**Cổng đo** (26/08 cuối ngày): lint sạch · typecheck xanh · **561 test / 76
file** xanh · **35 e2e** · **14 rig** xanh · build hết cảnh báo.
*Từ `a83b864` trở đi CHƯA deploy — máy bee đang chạy bản cũ hơn.*

---

## D · Quyết định — chặn code, không code được thay

- [x] 🧑 **D1** ~~Cò súng #4 đã nổ~~ **CHỐT 24/08: (a) chấp nhận có ý thức.**
      Ghi vào PRD §0.2 + [`docs/mo-hinh-c.md`](../docs/mo-hinh-c.md) (mô hình C
      là gì, quay về thế nào). Phase 3 mở khoá. `doctor` giữ mục đỏ `may-sach`.
      Cách siết rẻ nhất nếu đổi ý: tách bee sang VM/LXC riêng.
      **CẬP NHẬT 25/08 — cò súng đã GỠ, không còn phải "chấp nhận":** M1 xong,
      bee là uid 1500 riêng, `docker run -v /home/ducba:/h alpine ls /h` →
      *Permission denied*, `may-sach` trên máy bee **xanh**. Quyết định (a)
      hết hiệu lực; PRD §0.2 **đã sửa theo** (T20, xong 25/08).
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
- [ ] 🤖 **T1b** *AC "thu hồi ≥2.9GB" của T1 đã HẾT NGHĨA* — 3.0GB đó nằm ở
      `~ducba/.local/srv/bee`, mà máy giờ chạy bằng user `bee` với thư mục
      **rỗng**. AC mới: sau khi có phiên thật, `bee-gc` thu hồi worktree đúng
      luật D3 và `gc.json` ghi lý do giữ từng cái. Đo cùng **Checkpoint 1**.
      Số cũ để tham chiếu: rig-07 11/11, gc trên bee hiện `removed: 0` (đúng —
      chưa có gì để dọn).
- [x] 🤖 **T2** ~~doctor thấy đĩa~~ **XONG 24/08** — check `dia-phien`: dung lượng
      work+sessions · worktree mồ côi · tuổi `gc.json` (>48h = gc chết im lặng →
      đỏ) · vượt `GC_WARN_GB` → đỏ. rig-08: 6/6. Máy thật: *796M · 0 mồ côi ·
      gc chạy 0h trước*.
- [x] 🤖 **T3** ~~`/setup`: dung lượng + nút "Dọn ngay"~~ **XONG 24/08** — panel
      đọc `gc.json`, hiện đã thu hồi bao nhiêu và **lý do GIỮ từng worktree**
      (phần đáng giá hơn con số), nút gọi `bee-gc.service` oneshot. 10 test mới.
- [ ] ✅ **Checkpoint 1** — **CHƯA BẮT ĐẦU ĐẾM.** Máy đã live từ 26/08 (M2 xong,
      PAUSE gỡ) nhưng **chưa chạy phiên nào**: `dia-phien: 0`, repo chưa clone,
      `gc removed: 0`. Trên một máy nằm im thì đĩa không thể phình và gc không
      có gì để thu hồi — hai trong ba điều kiện tự "đạt" mà không chứng minh
      được gì. AC của T1b cũng nói thẳng *"sau khi có phiên thật"*.
      **Đồng hồ 3 ngày bắt đầu từ PHIÊN THẬT ĐẦU TIÊN.** Từ 26/08 tới đó chỉ
      đo được đúng một thứ, và cứ ghi nhận nó: doctor có xanh liên tục không.

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
- [ ] ✅ **Checkpoint 2** — quota trên ngưỡng: chặn đúng, lý do đọc được trên
      điện thoại; dưới ngưỡng không phiền.
      **Điều kiện tiên quyết:** `state/claude-usage.json` phải tồn tại. Khi
      `usage === null`, `xetHanMuc` **cho mở** kèm câu "đang bay mù" — nên máy
      chưa fetch usage lần nào thì bài này không thể trượt đúng cách, nó sẽ
      luôn cho qua. Đợi tick ghi file đó trước.
      **Cách đo** (không đẩy được usage thật lên, nên phải hạ ngưỡng xuống):
      sửa `QUOTA_BRAKE_PCT` trong `web.env` xuống dưới mức đang dùng, hoặc ghi
      thẳng `state/claude-usage.json`. Đo xong trả ngưỡng về 85.

## P3 · Hàng đợi + đi ngủ (FR-5.1 P0 · FR-5.2 P1) — ~~cần D1~~ *D1 đã mở*

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
      **Đây KHÔNG phải "xếp việc rồi đi ngủ" lần đầu.** Trên user `bee` mới,
      chưa thứ nào trong chuỗi này từng chạy: clone → worktree → cài fence
      pre-push → `gh` → skill `bee-push-pr`. Giao cả chuỗi đó cho một đêm không
      ai ngồi cạnh là chọn chỗ tệ nhất để phát hiện mắt xích hỏng.
      **Chạy thử MỘT việc giữa ban ngày bằng nút "Run now" trước** — cùng đúng
      đường code, chỉ khác là có người nhìn.

## P4 · Bản tin sáng (FR-5.3 P1)

- [x] 🤖 **T10** ~~Tổng hợp đêm qua~~ **XONG 24/08** — `dungBanTin()` thuần (7 test).
      Ba loại đêm là một trường riêng, không bắt UI đoán từ mảng rỗng:
      *không-xếp-việc* · *xếp-mà-không-chạy* · *có-việc* (PRD §4.1). Mỗi việc kẹt
      bắt buộc mang một câu vì-sao; thiếu `reason` thì suy từ trạng thái.
- [x] 🤖 **T11** ~~Lối vào bản tin~~ **XONG 24/08** — trang `/brief` ("Đêm qua"),
      thứ tự: chờ-bạn-duyệt → kẹt → đã chạy → còn chờ; mục sidebar riêng.

## P4b · Nền cho docker (làm cùng lúc tách user)

- [x] 🧑 **M1** ~~Tách bee sang user riêng~~ **XONG 25/08** — bee uid/gid 1500,
      `passwd -l`, **không** ở group docker/sudo/adm, linger bật, rootless
      docker chạy. **Nghiệm thu đã qua:** `docker run -v /home/ducba:/h alpine
      ls /h` → *Permission denied*; `-v ~bee/.local/srv/bee` thì đọc được.
      Stack cũ của ducba đã `stop`+`disable`, dữ liệu 961M giữ nguyên để quay
      lui (**T21** xoá sau). `tailscale serve` không phải sửa: vẫn
      `127.0.0.1:3210`, chỉ đổi ai giữ cổng. Đường đi thật (kể cả chỗ vấp):
      [`docs/tach-user.md`](../docs/tach-user.md).
- [x] 🧑 **M2** ~~Việc duy nhất đang chặn cả ba Checkpoint~~ **XONG 26/08** —
      token Claude, PAT fine-grained, `Anhduchb01/lifebook-assessment` đã đăng
      ký, `PAUSE` đã gỡ. Doctor xanh hết trên máy bee. **T13c tự khỏi luôn**:
      repo giờ đọc được (`repo:lifebook-assessment` xanh — chưa clone, fence
      pre-push sẽ cài ở phiên đầu). Ba Checkpoint hết bị chặn.
- [x] 🤖 **T16** ~~`bootstrap.sh` — máy trắng thành máy chạy bằng MỘT lệnh~~
      **XONG 25/08** — gộp node/pnpm · claude cli · docker rootless · `pnpm
      install` + `deploy.sh` đầu tiên. Chặn sớm và chặn có chỉ dẫn: ở group
      docker → thoát (ranh giới A+ vô nghĩa), thiếu gói → in nguyên lệnh apt,
      mất session bus → nhắc `enable-linger`. Tự ghi bus + `DOCKER_HOST` vào
      `~/.bashrc` vì `sudo -iu bee` không cho session bus, mà thiếu nó thì mọi
      `systemctl --user` phía sau chết. rig-12: 14/14. Token vẫn KHÔNG nhận ở
      CLI — dán ở `/setup` (argv và bash_history là chỗ token đi lạc).
- [x] 🤖 **T14** ~~`.env` per-phiên + dải cổng~~ **XONG 24/08** — `capPhatDaiCong()`
      quét THẬT bằng bind (4 test), tránh cả dải phiên khác **đã giữ chỗ dù chưa
      listen**; `port_base` vào session.json nên resume dùng lại đúng dải.
      Runner sinh `.bee/ports.env` + thay `${BEE_PORT_n}` trong env.d **chỉ đúng
      họ biến đó** — envsubst không giới hạn sẽ nuốt `$VAR` trong secret của
      repo. rig-11: 7/7. bee không cần biết tên biến của từng repo.
- [ ] 🤖 **T17** Lấy lại cgroup driver `systemd` cho rootless docker (S) —
      *(spec T15 §10 chốt: với thiết kế lát-chung thì CHƯA cần — chỉ thành bắt
      buộc nếu để mỗi phiên tự dựng stack đầy đủ.)*
      hôm nay đang chạy `cgroupfs` nên `docker info` báo `Cgroup Driver: none`
      và `--memory`/`--cpus` không ai thi hành. Gốc: `containerd` không thừa
      kế `DBUS_SESSION_BUS_ADDRESS` từ `dockerd` nên `runc` đi hỏi systemd hệ
      thống. Xem [docker-cho-bee.md §5b](../docs/docker-cho-bee.md). Chỉ cần
      làm khi T15 muốn đặt trần tài nguyên cho từng phiên.
- [~] 🤖 **T15** Cấp lát dịch vụ cho phiên — **CODE XONG 26/08, CHƯA NGHIỆM
      THU TRÊN POOL THẬT.** Máy dev không có postgres/rabbitmq/minio và không
      sudo sang `bee` được, nên toàn bộ b+c đo bằng rig với stub docker (đúng
      khuôn rig-14 dùng cho `systemctl`). Bằng chứng trên máy thật cần: deploy
      → thêm service vào `services/compose.yml` ở tab Configuration → bật
      `bee-services` → mở một phiên của repo có compose. **Spec 26/08:**
      [`docs/specs/service-slices.md`](../docs/specs/service-slices.md). Năm quyết
      định đã chốt trước khi code: bee tự đọc compose của repo và **đoán kiểu
      từ image** · tên lát theo **session uuid** (không theo `<slug>-<num>`,
      vì `num` trùng được khi mở hai phiên cùng lúc) · cấp lát là **rule chứ
      không AI** (chạy lúc không ai ngồi cạnh, cầm admin credential, và gc
      phải suy ra được tên để thu hồi) · pool định nghĩa **trên web** · màn
      cấu hình gộp một trang **hai tab**. Chia ba đợt:
  - [x] 🤖 **T15a** ~~`gc.sh` biết dọn docker của phiên~~ **XONG 26/08** —
        `don_docker()` hạ compose project **TRƯỚC** khi worktree biến mất
        (compose cần file trong worktree để đọc), `down -v --remove-orphans`
        vì volume mới là phần chiếm đĩa, thử cả hai tên project
        (`bee-<uuid8>` của spec và `bee-<slug>-<num>` của bee-preview).
        **Không hạ được thì GIỮ worktree** kèm lý do — xoá lúc đó là biến
        container thành mồ côi không ai lần ra được của phiên nào, đúng cách
        6.9GB volume / 17 cái đã tích lại. Nhưng chỉ giữ khi worktree **thật
        sự khai compose**: docker chết mà chặn oan phiên chưa từng đụng docker
        là lỗi khác. rig-07 phần 2: 9 ca mới, đã thử tắt code để chắc cả 5 ca
        chính đều đỏ trước khi nhận là xanh.
  - [x] 🤖 **T15b** ~~Lõi lát dịch vụ~~ **XONG 26/08** — `service-slice.sh`
        (tên tiếng Anh, spec viết `service-slices.sh`), sáu commit nhỏ:
        `doan_kieu` (bảng tra image, đoán trượt → rỗng chứ không đoán bừa) ·
        `doc_compose` (đọc compose bằng text, không cần docker) ·
        `provision` (role+db, vhost, bucket; idempotent; REVOKE CONNECT) ·
        `reclaim` + gc gọi (tên **luôn suy lại từ uuid**, rig thử nhét
        `bee_x; DROP DATABASE postgres; --` vào services.json và bắt nó không
        tới được psql) · `env.d` nhận `${BEE_DB_URL}`… · khung `services/` +
        unit pool **render mà không enable**.
        **Admin credential không bao giờ rời container pool** — mọi lệnh đặc
        quyền chạy qua `docker compose exec` bên trong chính service đó, nên
        máy không cần psql/rabbitmqctl/mc và không giữ bản sao mật khẩu nào.
        rig-15: 45 ca. rig-07 +4, rig-03 +4.
  - [ ] 🤖 **T15c** `/setup` hai tab + panel pool + panel lát đang cấp +
        doctor mục `dich-vu` (M).

## P4c · Nhiều tài khoản Claude (25/08)

- [x] 🤖 **T22** ~~Pool tài khoản + đổi qua lại trên `/setup`~~ **XONG 25/08** —
      panel đọc `tok list --json` (slot · email · trạng thái · thanh 5h/7d),
      nút đổi từng hàng, thêm slot bằng cách chụp login hiện tại hoặc đăng
      nhập tài khoản khác, và ô dán `TOKEN_SLAYER_TOKEN` để cài lần đầu.
      Hai cái bẫy im lặng được ép thành luật: **đổi khi còn phiên chạy** bị
      từ chối (phiên sẽ trôi sang tài khoản mới lúc làm mới token), và
      **`claude.env` đè lên lựa chọn** thì UI + doctor nói thẳng kèm nút gỡ.
      Tay lái pty tách ra `pty-flow.ts` dùng chung với `setup-token`.
      27 test mới. [`docs/nhieu-tai-khoan-claude.md`](../docs/nhieu-tai-khoan-claude.md).
- [x] 🤖 **T22b** ~~`SLAYER_MINIMAL_PAYLOAD=1`~~ **XONG 25/08** — thêm tầng
      `machine.env` (env của MÁY, mọi phiên đều nạp) và đặt biến đó trên bee:
      hook token-slayer từ nay chỉ gửi usage + attribution, bỏ prompt,
      `tool_input`, `tool_response` và câu trả lời cuối. Nạp **trước**
      claude.env nên không bao giờ đè được lên auth — rig-13 khoá đúng thứ tự
      đó (đảo lại → đỏ). Không nhét biến của công cụ bên thứ ba vào unit.

## P5 · Nợ nhỏ

- [x] 🤖 **T18** ~~Test đang khởi động unit THẬT trên máy thật~~ **XONG 25/08**
      — `lib/bee/ctl.ts` là cửa duy nhất (`ctl`/`ctlSpawn`, tôn trọng
      `BEE_CTL=none`); `vitest.setup.ts` đóng cửa cho CẢ bộ test nên bài nào
      cần lệnh thật phải **mở tay**, và chỗ mở đọc được trong diff (hai bài
      pty). Chặn tái phát bằng **luật**, không bằng lời hứa: eslint cấm
      `node:child_process` ngoài chính ctl.ts — cùng lý do như luật barrel
      của feature ngay trên nó. rig-03 thêm stub `ss` (sân giả không được
      đọc cổng thật của máy đang chạy rig). 5 test mới.
- [x] 🤖 **T19** ~~Web chết 1005 lần mà không ai biết~~ **XONG 25/08** —
      `port_owner()` trong lib chung (free/mine/other), dùng ở ba chỗ: doctor
      có mục `web` · `install.sh` dừng trước khi enable · `deploy.sh` hỏi chủ
      cổng TRƯỚC restart. Điểm đắt nhất của bài này: **"cổng trả lời" không
      phải bằng chứng "web CỦA TA chạy"** — hôm đó curl nhận 307 suốt, từ web
      của người kia, nên vòng chờ của deploy vẫn báo ✓. Kèm `doctor.sh
      --exit-zero` (unit dùng bản đó): chạy xong một lượt khám và khám ra bệnh
      là hai chuyện khác nhau. rig-14: 16/16.
      **Nghiệm thu trên MÁY THẬT 26/08** — một check chỉ từng xanh thì chưa
      chứng minh gì, nên đo bằng cách ép nó đỏ:
      · deploy in `chủ cổng: mine 2808349` (đúng câu hỏi 25/08 không ai hỏi)
      · `✓ bee-web active · 3210 trả 307 · restart 0 lần`
      · **tắt bee-web → `✗ bee-web failed — không ai phục vụ`** (trước đây
        chỗ này xanh suốt 1005 lần restart)
      · và lúc CÓ mục đỏ, `bee-doctor.service` vẫn `Result=success`
      · bật lại → xanh trở lại, `NRestarts` vẫn 0.
- [x] 🤖 **T20** ~~PRD §0.2 + mo-hinh-c.md nói ngược sự thật~~ **XONG 25/08** —
      sửa **ba** chỗ (thêm `architecture.html`, nó cũng viết "ranh giới là vỏ
      máy — không phải UID"). Không xoá lịch sử: giữ nguyên đoạn 24/08 rồi nói
      tiếp nó đã rút, vì đó là lý do tồn tại của M1. Ghi kèm cái tách user
      **KHÔNG** mua được (chung kernel · chung tailnet · vào group docker là
      mất sạch) để §5b không bị đọc rộng hơn nó thật. PRD lên bản 3.3.
- [ ] 🧑 **T21** Xoá `~ducba/.local/srv/bee` (**961M**) + gỡ hẳn 5 unit của
      ducba — **chỉ sau khi** bee chạy tốt vài ngày (đây là đường quay lui duy
      nhất hiện có). Lịch sử phiên cũ không mang sang được nên xoá là xoá thật.

- [x] 🤖 **T12** ~~Trần `run.jsonl` theo byte~~ **XONG 24/08** — `cat-log.sh` cắt
      theo DÒNG (nửa dòng JSON làm hỏng parser), giữ phần MỚI NHẤT, chèn
      `bee_truncated` ở đầu file; reaper gọi mỗi tick. UI render "✂ N dòng đầu
      đã bị cắt — phần đó không còn nữa", **khác** `replay` (chỉ là vào muộn).
      rig-10: 7/7. Mặc định `RUN_MAX_KB=20480`.
- [ ] 🧑 **T13a** `sudo rm -rf ~/.local/opt/bee` — junk root-owned **vẫn còn**.
- [ ] 🧑 **T13b** PAT "All repositories" → "Only select repositories" (vệ sinh A+ §2).
- [x] 🧑 **T13c** ~~PAT không đọc được `lifebook-assessment`~~ **HẾT 26/08** —
      PAT mới dán ở M2 đọc được, `repo:lifebook-assessment` xanh.
      **Đính chính:** note cũ ở đây viết "bảng dự án im lặng bỏ qua repo không
      đọc được" — **sai, và sai ngay lúc viết**. `fetchRepoIssues` trả về lý do,
      `loadBoard` gom, `/projects` in đỏ; có test từ `cab39f7` (24/08). Đường
      im lặng CÓ THẬT thì hẹp hơn, và đã vá ở **T23** bên dưới.

## P5b · Dọn sau khi máy live (26/08) ✅

Ba thứ nhặt được lúc nghiệm thu T19 trên máy thật. Không cái nào chặn
Checkpoint, nhưng cả ba cùng một họ với T18–T20: **một thứ nói dối im lặng**.

- [x] 🤖 **T23** ~~Bảng dự án trống mà không nói vì sao~~ **XONG 26/08** — sau
      khi kiểm thì repo-không-đọc-được **đã** được báo từ 24/08 (xem T13c). Cái
      còn hở: `gh` thoát 0 nhưng trả JSON khác dạng → bảng trống, `loi: null`,
      và **một bảng trống im lặng đọc y hệt "repo này chưa có issue nào"**.
      Giờ: không phải mảng → nói ra; bỏ n/m dòng hỏng → nói ra số; và `loi`
      **nằm trong cache** (đọc thiếu mà 60 giây sau im lặng thì cache đang nói
      dối). 3 test mới.
- [x] 🤖 **T24** ~~`stop` bình thường để lại unit `failed`~~ **XONG 26/08** —
      thấy lúc ép doctor đỏ: tắt bee-web xong unit nằm `failed` chứ không
      `inactive` (Next thoát 143 sau SIGTERM), nên `systemctl --failed` lúc nào
      cũng có sẵn một dòng. `SuccessExitStatus=143 SIGTERM`. Chết vì SIGKILL
      hay lỗi thật thì VẪN đỏ. rig-03 khoá dòng đó trong unit.
- [x] 🤖 **T25** ~~Turbopack trace cả project~~ **XONG 26/08** — gốc không phải
      chuyện build: `path.join(process.env.HOME ?? "", ".claude", …)` ra đường
      dẫn **tương đối** khi thiếu HOME, tức lặng lẽ đọc credential của thư mục
      tiến trình đang đứng. Chặn HOME rỗng + `turbopackIgnore`. Test mới **đã
      thử đỏ trên code cũ** trước khi nhận là xanh.

## P5c · Dùng thật thì lộ ra (26/08) ✅

- [x] 🤖 **T26** ~~Autopilot trông như không làm gì~~ **XONG 26/08** — hàng đợi
      vốn chạy **bất cứ lúc nào** (tick 30 phút, không có khung giờ nào ở đâu),
      nhưng chờ nửa tiếng thì trên màn hình đọc y hệt "hệ thống đứng im". Thêm
      nút **Run now** ở toolbar bảng dự án, gọi ĐÚNG nhịp mà timer gọi — vẫn
      một phiên, vẫn qua phanh, vẫn tôn trọng PAUSE/⏸ — và in ra lý do khi
      không mở được. Phần nối dây rời `/api/tick` sang `lib/bee/tick.ts` để hai
      đường gọi dùng chung một bản. 4 test mới.
- [x] 🤖 **T27** ~~Màn "Đêm qua" có điểm mù theo giờ~~ **XONG 26/08** — cửa sổ
      cắt từ 18:00 hôm trước, nên mở lúc 3 giờ chiều là thấy "chưa chạy gì"
      trong khi ba phiên vừa xong lúc 2 giờ. Một trang sinh ra để nói *chuyện
      gì đã xảy ra* mà có điểm mù thì nó đang nói dối. Đổi sang **24 giờ
      trượt**, đổi tên thành **Activity**. 2 test mới.
- [x] 🤖 **T28** ~~UI còn tiếng Việt~~ **XONG 26/08** — theo quy ước 18/08
      (chat tiếng Việt, màn hình tiếng Anh): lý do hàng đợi, câu phanh hạn mức,
      câu vì-sao của Activity, lý do từ chối kéo thả, panel tài khoản Claude.
      Comment trong code vẫn tiếng Việt — đây là chữ NGƯỜI DÙNG đọc.
- [x] 🤖 **T29** ~~Nền và component không tách nhau~~ **XONG 26/08** — dark cũ
      là Geist: nền `#000`, thẻ `#0a0a0a` — cách nhau 4/255 (**1.06:1**), thẻ
      chỉ tồn tại nhờ một đường 1px; ô nhập `bg-input/30` trên nền đen là vô
      hình. Đổi sang **VS Code Dark Modern**, lấy từ upstream microsoft/vscode.
      *Bài học kèm theo:* lần đọc đầu tôi lấy file trên máy (VS Code 1.121),
      thiếu ba khoá, và đọc `#2B2B2B` là màu **viền** rồi kết luận ngược —
      chủ dự án bắt kiểm lại upstream mới ra `welcomePage.tileBackground`
      (màu **thẻ**), `editorGroup.border #FFFFFF17` (trắng mờ, tự chỉnh theo
      bề mặt) và `quickInput #222222`. Chrome `#181818` ôm nội dung `#1F1F1F`,
      thẻ `#2B2B2B`, ô nhập `#313131`. Nghiệm thu bằng máy chụp ảnh qua 7 cảnh
      dữ liệu + điện thoại, không bằng bảng số.

## Treo — có lý do, không phải quên

- [ ] **FR-5.4 mở khoá dần theo repo** — **là FR của V3, chưa đóng, chỉ hoãn.**
      mode per-phiên + PAUSE + phanh đã phủ phần lớn. Treo tới khi chạy đêm
      thật rồi mới biết còn thiếu gì. Nên câu đúng về V3 là *"không còn code
      nào ĐÃ LÊN LỊCH"*, không phải *"không còn code nào bắt buộc"*:
      Checkpoint 3 là thứ quyết định dòng này có đẻ ra code hay không.
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
- [x] 🧑 **S4.1** ~~Tạo fine-grained PAT · branch protection `main`~~
      **ĐÓNG 26/08 bởi M2** — PAT đã dán qua `/setup`, `pat` xanh. Branch
      protection GitHub không bật được (plan Free + repo private, chốt 19/08);
      thay bằng fence hạ cấp `pre-push-bee`, doctor ghi rõ trạng thái hạ cấp.
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

## P5d · Dọn ngôn ngữ (26/08) ✅

- [x] 🤖 **T30** ~~Code còn tiếng Việt~~ **XONG 26/08** — chủ dự án phải nhắc
      lại một luật đã có từ 18/08: *"trong code tất cả đều là tiếng Anh, chỉ
      chat mới tiếng Việt"*. Lỗi tôi mắc suốt phiên: thấy file xung quanh toàn
      comment tiếng Việt nên viết theo cho "khớp phong cách" — sai, vì luật là
      **code mới/sửa thì tiếng Anh** kể cả khi file xung quanh chưa đổi.
      Dọn toàn bộ phần tôi viết trong phiên: tên hàm (`doan_kieu`→`guess_kind`,
      `cap_lat_dich_vu`→`ensure_service_slice`, `chayNhipHangDoi`→`runQueueTick`,
      `NutChayNgay`→`RunNowButton`, `tabMacDinh`→`defaultTab`…) · comment ·
      chuỗi hiển thị · tên bài test · tên file rig (`rig-14-web-alive.sh`…) ·
      tên spec (`service-slices.md`).
      Kèm: **toàn bộ checklist doctor sang tiếng Anh** và đổi ba id cho khớp
      (`may-sach`→`clean-host`, `dia-phien`→`session-disk`, `dia`→`disk`) —
      chúng là chữ người dùng đọc trên `/setup`, nên nửa Việt nửa Anh là tệ
      nhất trong ba lựa chọn.
      **Chưa đụng:** identifier tiếng Việt có từ trước và phiên này không sửa
      (`moPhien`, `docTiep`, `ghepThe`, `dungBanTin`, `HangDoi`…). Đổi ồ ạt là
      một quyết định riêng, chạm gần như mọi file.

- [x] 🤖 **T31** ~~Đổi identifier tiếng Việt sang tiếng Anh~~ **XONG 27/08 (phía web)** —
      hai đợt. Đợt đầu (120 file) chỉ đổi tên xuất; đợt sau đóng nốt phần cục
      bộ và **phải viết một bộ thay thế hiểu cú pháp** vì regex thô hỏng theo
      hai chiều ngược nhau:
      · ăn vào **chuỗi**: `giu-bo-loc-….gif` thành `held-dropped-loc-….gif`,
        và regex literal `/7-day/` thành `/7-stack/`;
      · ăn vào **comment**: 154 dòng tiếng Việt bị chèn từ tiếng Anh vào giữa,
        thành vô nghĩa — tệ hơn cả để nguyên.
      Bộ mới bỏ qua chuỗi và comment, chỉ viết lại phần là CODE (kể cả bên
      trong `${…}` của template literal).
      **Nhưng phải sửa tay hai loại mà nó cố ý không đụng:** `dataKey="nhan"`
      và `var(--color-xong)` là *chuỗi trỏ tới tên trường* — đổi trường mà
      không đổi chúng thì biểu đồ mất trục và mất một cột, và **chỉ e2e bắt
      được**, không test đơn vị nào thấy.
      Va chạm đáng ghi: `BeeRepoDangKy` muốn thành `BeeRepo` nhưng tên đó đã
      có chủ (kiểu thời reconciler mang `full/enabled/paused/running/wip`).
      Hai thứ khác nhau cùng tên sẽ biên dịch được ở vài chỗ và lệch im lặng
      ở chỗ khác → `BeeRegisteredRepo`.
      **Đo lại 26/08 sau sự cố canvas:** tôi đã báo "còn 1 chỗ" — sai, vì
      bảng từ dùng để quét quá hẹp. Quét lại bằng từ điển hệ thống: còn
      **~110 tên khai báo** thật sự tiếng Việt (`TONE_PHIEN`, `CUA_SO`,
      `TRANG_THAI`, `NHAN`, `KHONG_QUYEN`, `CAU_HINH`, `ChoChayNode`,
      `nguCanh`, `tomTatBayNgay`, `ky`/`mau`…). Việc còn dở, không phải xong.
- [x] 🤖 **T34** ~~Đổi tên bằng SYMBOL, không bằng regex~~ **XONG 27/08** —
      năm đợt, 430+ symbol, mỗi đợt một commit và bốn cổng riêng. Công cụ là
      language service của TypeScript (`findRenameLocations` với
      `findInStrings=false`, `findInComments=false`) — nó đổi **một symbol**,
      nên về nguyên tắc không chạm được vào chuỗi hay comment.
      **Hai chốt chạy TRƯỚC khi ghi:**
      · *sinh đôi chuỗi* — tên nào cũng xuất hiện dưới dạng chuỗi trong TS thì
        giữ lại soi tay. Đó chính là hình dạng đã làm trắng canvas (T33).
      · *che biến* — rename của TS **không** kiểm tên mới đã bị chiếm chưa.
        Trùng thì typecheck đỏ, nhưng **che thì im lặng**. Đổi tên đích cho tới
        khi báo cáo trống (`result`→`outcome`, `projects`→`sidebarProjects`…).
      **Bốn chỗ language service không nhìn thấy — cả bốn đều do TEST bắt:**
      · object literal **không có kiểu** (`toEqual({ chiPhiHomNay: 0 })`);
      · `& Record<string, unknown>` của React Flow — index signature nuốt mất
        thuộc tính nên `data.cauCuoi` không phải cùng một symbol;
      · barrel re-export: rename giữ tên public bằng alias, để lại
        `export { mergeEvents as gopSuKien }`;
      · code nằm trong template literal (stub pty) — một chữ `ten` sống sót
        sau khai báo của nó và làm sập cả tiến trình.
      **Va chạm thật:** `Card`/`StreamEvent` đã có sẵn `kind` cạnh `loai`;
      `raw.kind` phải giữ vì đó là khoá của JSONL do runner ghi.
      **Ranh giới không typecheck:** id cảnh fixture đi qua cookie và
      `BEE_FIXTURE_SCENE` dưới dạng `string`, và còn là **tên file**. Nghiệm
      thu bằng cách CHẠY cả bảy cảnh (bộ screenshot vốn bị skip, bật lên
      riêng), không phải bằng đọc.
      **Một bug tự tạo, tự bắt:** `bee-fixture-khong-bi-mat` nằm ở HAI file
      (index.ts ký, token.ts xác minh) — đợt trước chỉ đổi một. Không test nào
      đỏ vì đường đó hiện không với tới nhau. Giờ là một hằng `FIXTURE_SECRET`.
      **Còn lại (cố ý giữ):** `du-an` trong search-filter.test là *đối tượng*
      của bài test bỏ dấu — đổi nó là xoá bài test; `xong` là lời agent trong
      fixture; `Thu` là Thursday.
      Quét cuối bằng AST: **0/2511 identifier** còn tiếng Việt.
- [x] 🤖 **T38** ~~Làm chủ pool dịch vụ từ web (bật/tắt + sửa compose)~~ **XONG 27/08** —
      panel cũ xem được mà không đổi được, và ô rỗng còn bảo chủ máy "vào máy
      sửa `services/compose.yml`" — câu lạ trong một sản phẩm sinh ra để khỏi
      phải làm thế.
      **Hai chiều KHÔNG đối xứng, vì hậu quả không ngang nhau:**
      · *Lưu* được kiểm trước khi đè: file compose không parse được thì pool
        sập, và mọi phiên cần dịch vụ chung bị TỪ CHỐI ngay ở cửa. Kiểm cấu
        trúc trước (`services:` ở cấp cao nhất), rồi `docker compose config -q`
        trên một bản chép tạm — phán quyết duy nhất khớp với chương trình sẽ
        thật sự đọc file. Không có docker (hoặc cửa `ctl` đóng) là "không trả
        lời được", **không phải** "không hợp lệ". Lưu bị từ chối thì file cũ
        nguyên vẹn.
      · *Tắt* thì hỏi trước. Một lát CHÍNH LÀ database của phiên; tắt pool khi
        còn phiên giữ lát là rút database khỏi tay một agent đang chạy. Lời từ
        chối đếm rõ bao nhiêu phiên, và "Stop anyway" là **cú bấm thứ hai** chỉ
        hiện ra SAU khi bị từ chối — không phải ô tick bấm một lần rồi quên.
        Bật thì không cần xin phép: bật không phá gì. Bật pool RỖNG bị từ chối,
        vì một unit lên mà không có gì để chạy thì chẳng nói lên điều gì.
      `poolRunning()` trả `null` khi không hỏi được systemd, và panel ghi
      "cannot ask systemd" chứ không vẽ "stopped" — một vệt đỏ sai ở đây đẩy
      người ta đi sửa cái máy đang lành.
      Không thêm dependency YAML: docker mới là bộ kiểm thật, phần TS chỉ là
      sàn cho chỗ không có docker.
- [x] 🤖 **T39** ~~429 khi refresh hạn mức Claude~~ **XONG 27/08** —
      `api/oauth/usage` bị giới hạn theo TÀI KHOẢN và có hai người gọi:
      `bee-tick` (30 phút) và nút Refresh. Rơi vào cùng một phút là ăn 429 mà
      **không ai cần** — câu trả lời đã nằm trên đĩa, mới vài giây. Giới hạn
      của Anthropic không sửa được; va chạm này thì có: ảnh chụp dưới 60 giây
      được dùng lại. Nút bấm truyền `force`, vì đưa số cũ cho người vừa bấm
      nút cũng là một kiểu nói dối.

- [x] 🤖 **T36** ~~Gỡ `apps/reconciler` và dời writer cuối cùng~~ **XONG 27/08** —
      **Tôi soát sai một lần trước khi làm đúng.** Lần đầu tôi kết luận ba file
      web đọc là do reconciler ghi độc quyền — vì chỉ grep `apps/runner` và
      `apps/reconciler`. Thật ra `harvestClaudeUsage()` trong **chính web** đã
      sinh lại `state/recent.jsonl` và `state/claude-rate-limit.json` từ phiên
      trên đĩa, chạy theo `bee-tick.timer` và nút Refresh. Chỉ
      `public/status.json` là thật sự mồ côi.
      **Hậu quả của lỗ đó đã nằm ngay trong mọi ảnh chụp tháng này:** góc trái
      dưới ghi "No data from the runner yet" — vì không ai ghi `status.json`
      cả. Nay `readStatusIn` dựng trạng thái từ nguồn của chính runner:
      `heartbeat.json` (reaper mỗi tick) · `PAUSE` · `repos.d`.
      **`BeeStatus` thu về đúng 4 trường có màn nào đọc.** Hình dạng cũ mang
      `slots` (bể build/evidence), `queue`/`recent`/`wip` theo repo, và `rule`
      cho mỗi việc đang chạy — mô hình rule của reconciler. Runner là
      session-first: không rule, không pool. Giữ lại nghĩa là phải bịa số để
      lấp, nên bộ parser kiểm chúng cũng đi theo.
      **Giữ có chủ đích:** `dropped` — một mục `repos.d` đọc không được thì
      ĐƯỢC ĐẾM, không giấu; một dự án chủ máy đăng ký rồi cứ thế không xuất
      hiện là đúng thứ im lặng mà hệ này sinh ra để chặn.
      **Bỏ có chủ đích:** pause theo từng repo (`.agent/PAUSE` trên nhánh mặc
      định) — khái niệm của reconciler. Runner có MỘT công tắc, đã nằm ở `mode`.
      **Xoá kèm:** `apps/web/install.sh` (320 dòng) — installer của mô hình C
      (hai UID `bee` + `bee-web`, /srv/bee thuộc root, `bee-spec-chat.service`
      không tồn tại ở đâu khác), và nó từ chối chạy nếu thiếu reconciler.
      `deploy.sh` gọi `apps/runner/install.sh` từ lâu rồi.
      Cảnh `reconciler-dead` → `runner-dead`: nó vốn không nói về reconciler mà
      về "heartbeat cũ và không có gì đỏ để nhìn" — nay mang tên thứ thật sự tick.
      Lịch sử giữ ở nhánh `feat/bee-m3-and-web-spec`.
- [x] 🧑 **T37** ~~Xoá 5 component web không ai import~~ **XONG 27/08** —
      `stat-grid`, và `alert`/`badge`/`sonner`/`table` của shadcn thêm vào rồi
      không dùng. `board-table` cố tình KHÔNG phải `<table>` nên `ui/table`
      cũng không có ai gọi.

- [x] 🤖 **T35** ~~Đổi tên tiếng Việt trong bash~~ **XONG 27/08** — ba đợt,
      `apps/runner` (bin + lib + 14 rig) và `apps/reconciler`.
      **Lưới phải dựng TRƯỚC, vì bash không có typechecker:** ảnh chụp những gì
      mỗi rig IN RA — 191 dòng phán quyết ✓/✗ + 14 exit code, chuẩn hoá đường
      tmp/SHA/PID/đồng hồ. Đã chứng minh nó **giống hệt nhau qua hai lần chạy
      trước khi sửa bất cứ gì** — một baseline không ổn định thì không phải lưới.
      Reconciler có lưới riêng: 4 script test, 94 dòng.
      **Tool đi theo trạng thái trích dẫn của chính bash:**
      · nháy đơn và heredoc `'EOF'` không nở gì → không bao giờ sửa
      · trong nháy kép / heredoc thường / comment → CHỈ `$name`
      · code không nháy → mới xét cả từ trần
      Nhờ vậy `err "thiếu gói"` giữ nguyên câu tiếng Việt còn `$tuoi` ngay cạnh
      thì đổi — đúng chỗ regex không phân biệt được, và là chỗ đã phá repo hai lần.
      **Test chính cái tool tìm ra ba lỗi trước khi nó chạm code thật:**
      `${#name}` không được nhận là tham chiếu; `"$(( a + b ))"` giấu từ trần
      *là* biến (bản đầu coi vùng nháy kép là một khối phẳng); và tệ nhất, nó
      **xoá mất dòng kết thúc heredoc** vì các span không phủ kín file — giờ có
      khẳng định từ chối ghi nếu span không lát kín.
      **Lưới bắt được lỗi thật:** rc=127 ở ba rig — hàm trong `common.sh` đã đổi
      tên nhưng chỗ gọi trong rig thì chưa.
      **Bài học đắt nhất — `trap '…'`:** nháy đơn nên tool bỏ qua, và về mặt từ
      vựng là đúng; nhưng trap trả thân của nó *lại cho shell chạy như code* lúc
      nổ. `worker.sh` đọc `${RUN_KET:-unknown}` trong khi `state.sh` đã sang
      `RUN_RESULT` → mọi run sẽ bị ghi sổ là "unknown" vĩnh viễn, không có gì đỏ.
      **Bốn test reconciler xanh y hệt trước/sau, vì không bài nào làm trap nổ.**
      Tìm ra bằng cách quét CẢ LỚP (mọi thân nháy đơn của trap/eval/bash -c/sh -c
      tham chiếu tên vừa đổi) — đúng một chỗ trong toàn repo; hai đợt runner sạch.
      **Còn lại:** 0 tên tiếng Việt trong `apps/runner`, kể cả systemd unit.
      `sudoers/bee` không phải bash — tool không đụng tới.

- [x] 🤖 **T33** ~~Canvas trắng bốc sau khi đổi tên~~ **XONG 26/08** — loại
      lỗi y hệt `dataKey="nhan"`, chỉ khác nó nằm ở **khoá object không nháy
      nháy**. `nodeTypes` đăng ký `phien: SessionNode` — khoá trông như
      identifier nên bị đổi thành `session`, còn `type: "phien"` là chuỗi nên
      được giữ. React Flow **không cảnh báo** khi gặp type lạ: nó lặng lẽ vẽ
      node mặc định — hộp rỗng hai chấm. Đúng số node, đúng layout, không lỗi,
      không nội dung.
      Sửa bằng cách làm cho **lệch là không build được**, không phải vá lại
      khoá: `NODE_KIND` trong build-graph là nguồn duy nhất, tên lát đổi sang
      tiếng Anh ở tầng **giá trị** (`"phien"`→`"session"`,
      `"cho-chay"`→`"queued"`), và canvas-view khai `Record<NodeKind, …>` nên
      khoá trôi là TS2353 — đã kiểm bằng cách phá có chủ đích.
      **Vì sao lọt tới máy thật:** `/canvas` không có e2e nào. Giờ có, và đã
      kiểm nó đỏ trên bản hỏng (`.react-flow__node-default` phải bằng 0).

- [x] 🤖 **T32** ~~Không ai kiểm giao ước bash↔TS~~ **XONG 26/08** — rename
      bằng regex có một đường hỏng mà **cả 561 test lẫn 35 e2e đều không bắt
      được**: đổi một khoá JSON ở phía TS thì test TS vẫn xanh (nó tự ghi tự
      đọc), còn file thật do bash ghi thì lệch. `bash-contract.test.ts` chạy
      **script thật** rồi đưa cho **reader thật**: doctor.sh → readDoctorFrom ·
      gc.sh → readGcIn · session-run.sh → readSessionIn · service-slice.sh →
      readSessionSliceFrom. Không fixture, không JSON viết tay.
      Đã kiểm ngược từng khoá bằng cách phá có chủ đích — và bắt được **hai lỗ
      trong chính bài test**: nhánh `kept` của gc để `bytes`=0 nên đọc nhầm
      khoá vẫn xanh (thêm ca `removed`), và `services.json.at` fallback về `""`
      nên không ai để ý (thêm khẳng định giá trị).
