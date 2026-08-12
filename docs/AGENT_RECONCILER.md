# Agent Reconciler — Thiết kế điều phối

Thiết kế chi tiết cho phương án **C · Polling reconciler** đã chốt ở [AGENT_FLOW.md §4](AGENT_FLOW.md#4-điều-phối--ba-phương-án).

Không dùng GitHub Actions. Không dùng webhook. Một tiến trình trên PC Ubuntu, cứ 30 giây đối chiếu trạng thái trên GitHub với thực tế và làm **đúng một việc** để kéo hai bên về gần nhau.

---

## 1. Mô hình

Khác biệt cốt lõi so với event-driven:

| | Event-driven | Reconcile |
|---|---|---|
| Câu hỏi mỗi lần chạy | "Vừa có chuyện gì xảy ra?" | "Hiện trạng đang lệch ở đâu?" |
| Nguồn sự thật | HTTP request thoáng qua | Label + PR trên GitHub |
| Bỏ lỡ một lần | Mất việc | Không sao, lần sau nhặt |
| Chạy lại | Nguy hiểm | Vô hại |
| Máy tắt 3 tiếng | Mất hết | Bật lên chạy tiếp |

Hệ quả thiết kế: **mọi hành động phải idempotent**, và **trạng thái không bao giờ nằm trong bộ nhớ tiến trình**. Nếu reconciler bị `kill -9` giữa chừng, lần tick sau phải tự hiểu được nó đang ở đâu chỉ bằng cách nhìn GitHub + thư mục state trên đĩa.

Đây là lý do reconciler hợp với "git là source of truth" hơn hẳn hai phương án kia: nó không có trạng thái riêng để mà lệch.

---

## 2. Tiến trình & song song

### 2.1. Tách người điều phối khỏi người làm việc

Bản thiết kế đầu tiên để reconciler tự chạy luôn công việc dài — sai. Nếu một tick mất 40 phút build task #42 thì suốt 40 phút đó không ai để ý tới review comment của Techlead trên PR #38, không ai chạy CI, không ai làm gì cả. Hệ thống nghẽn ở đúng chỗ nó không nên nghẽn.

Sửa lại thành **dispatcher + worker**:

```
bee-reconcile.timer  (30s)
   └─► bee-reconcile.service   [oneshot, < 5 giây, LUÔN nhanh]
          │  nhìn state, chọn 1 việc, kiểm tra còn slot không
          └─► systemd-run bee-task@42.service   ← rồi THOÁT NGAY
                    │
                    └─► /opt/bee/bin/worker.sh 42   [chạy 40 phút cũng được]
```

Reconciler **không bao giờ** chạy việc dài. Nó chỉ quyết định và giao việc.

```ini
# /etc/systemd/system/bee-reconcile.service
[Service]
Type=oneshot
User=bee-orch
EnvironmentFile=/etc/bee/orch.env      # GH_TOKEN, root-only
ExecStart=/opt/bee/bin/reconcile.sh
TimeoutStartSec=120                          # ← tick nào quá 2 phút là có bug
```

```ini
# /etc/systemd/system/bee-task@.service   ← template unit, %i = số issue/PR
[Service]
Type=oneshot
User=bee-orch
EnvironmentFile=/etc/bee/orch.env
ExecStart=/opt/bee/bin/worker.sh %i
TimeoutStartSec=45min
```

`TimeoutStartSec=120` ở reconciler là một cái bẫy cố ý: nếu bạn lỡ nhét việc dài vào reconciler, systemd sẽ giết nó và bạn biết ngay, thay vì phát hiện sau hai tuần khi hệ thống chậm một cách khó hiểu.

### 2.2. Template unit làm luôn ba việc

Đặt tên unit theo số issue (`bee-task@42.service`) cho không ba thứ:

| | Cách làm tay | Với template unit |
|---|---|---|
| **Khoá theo task** | PID file, kiểm tra process còn sống | systemd từ chối start unit đã active — **không thể chạy trùng #42** |
| **Biết cái gì đang chạy** | Quét PID file, xử lý file mồ côi | `systemctl list-units 'bee-task@*'` |
| **Log tách theo task** | Tự tách file | `journalctl -u bee-task@42` |

Đây cũng là lý do §5 không cần kiểm tra PID nữa: **claim = unit đang active**. Task chết giữa chừng thì unit chuyển sang `failed`, nhìn thấy được, dọn được.

### 2.3. Hai bể slot, không phải một

Tưởng chừng chỉ cần một con số "chạy tối đa N task". Thực tế hai loại công việc có đặc tính tài nguyên khác hẳn nhau:

| Bể | Việc | Slot | Vì sao |
|---|---|---|---|
| **build** | rule 2, 7, 8 — agent sửa code | **2–3** | Chủ yếu chờ I/O và chờ model; CPU nhàn |
| **evidence** | rule 3, 4 — CI + E2E quay video | **1** | Ngốn CPU/RAM; chạy song song làm nhau **flaky** |

**Bể evidence phải là 1.** Ba lần chạy Playwright cùng lúc trên một máy sẽ làm nhau timeout, và bạn sẽ có test đỏ ngẫu nhiên không tài nào tái hiện được. Bằng chứng flaky tệ hơn bằng chứng chậm — nó dạy reviewer mất niềm tin vào đúng thứ đáng tin. Đây là chỗ **cố ý không song song hoá**, không phải chỗ chưa tối ưu.

Thêm một trần nữa, khác bản chất: `MAX_WIP` — số PR agent mở cùng lúc (2–3). Slot giới hạn *tài nguyên máy*; WIP giới hạn *khả năng review của người*. Techlead review được 3 PR/ngày mà agent mở 8 thì hàng đợi PR sẽ conflict lẫn nhau — đây là nghẽn ở người, tăng slot không giải quyết được.

### 2.4. Ngân sách RAM — máy 32GB

| Hạng mục | Đơn giá | Số lượng | Tổng |
|---|---|---|---|
| OS + Docker daemon | — | — | ~2 GB |
| Build slot (kèm Postgres + Redis + build tool) | ~2,5 GB | 3 | 7,5 GB |
| Evidence slot (stack đầy đủ + Chromium quay video) | ~3 GB | 1 | 3 GB |
| Preview env (sống suốt vòng đời PR) | ~1,5 GB | 3 | 4,5 GB |
| Caddy + cloudflared + dashboard | — | — | ~0,5 GB |
| **Đã cam kết** | | | **~17,5 GB** |
| **Còn lại cho page cache & đỉnh tải** | | | **~14 GB** |

Cấu hình khuyến nghị: **`MAX_BUILD_SLOTS=3`, `MAX_EVIDENCE_SLOTS=1`, `MAX_PREVIEWS=3`**.

**Ở mức 32GB, RAM không còn là ràng buộc — quota Claude mới là.** Ba agent song song đốt hạn mức thuê bao nhanh gấp ba, và bạn sẽ chạm rate limit từ rất lâu trước khi chạm trần bộ nhớ. Vì vậy đừng nâng lên 4 slot build dù còn thừa RAM; nếu thấy rate limit giữa ngày thì **giảm** slot, không phải nâng máy.

Vẫn giữ `MAX_WIP=3` (số PR agent mở cùng lúc) — đây là trần khác bản chất, giới hạn bởi khả năng review của người chứ không phải phần cứng.

### 2.5. Mỗi tick vẫn chỉ giao một việc

Kể cả khi còn 3 slot trống, một tick chỉ dispatch **một** task rồi thoát. Lấp đầy 3 slot mất 90 giây — chấp nhận được, và đổi lại giữ nguyên tính chất "mỗi lần chạy chỉ có một thứ có thể sai", vốn là thứ làm reconciler dễ debug.

### 2.6. Cái gì tuyệt đối không được song song

| Không được | Vì sao | Cách chặn |
|---|---|---|
| Hai worker trên cùng issue/PR | Ghi đè lẫn nhau | Template unit — systemd tự chặn |
| Agent sửa code + CI cùng một worktree | Test chạy trên code đang thay đổi | Cùng một unit ⇒ tuần tự theo bản chất |
| Nhiều E2E cùng lúc | Flaky | Bể slot riêng = 1 |
| Hai preview cùng project name | Đụng container/port | `docker compose -p pr-<N>` |
| Reconciler chạy chồng chính nó | Giao trùng việc | `Type=oneshot` + `OnUnitInactiveSec` |

---

## 3. Ba tầng "agent", hai user

Từ "agent" trong tài liệu này bị dùng cho ba thứ khác nhau. Tách ra thì mọi câu hỏi về "nhiều agent" trở nên rõ ràng.

| Tầng | Là cái gì | Có bao nhiêu | Ai điều khiển |
|---|---|---|---|
| **1 · Rule** | Đoạn bash quyết định "cần làm gì" | 9 rule | Deterministic, **không có LLM** |
| **2 · Vai trò** | Một tiến trình `claude` với prompt + quyền riêng | 4 vai trò | Rule chọn vai trò nào |
| **3 · Subagent** | Persona bên trong một tiến trình `claude` | Tuỳ task | Chính agent tầng 2 |

**Tầng 1 không dùng LLM, và đó là chủ ý.** Chỉ 4 trong 9 rule cần gọi model:

| Rule | Vai trò tầng 2 | Prompt | Quyền |
|---|---|---|---|
| 2 · review feedback | **Review-fixer** | `review-fix-prompt.md` | Sửa code + `--resume` phiên cũ |
| 3 · CI | — | — | *Script thuần, không có agent* |
| 4 · evidence | **Evidence runner** | `evidence-prompt.md` | Chạy test; chỉ sửa code khi đỏ |
| 5 · approvals | — | — | *Script thuần* |
| 6 · preview | — | — | *Script thuần* |
| 7 · build | **Builder** | `build-prompt.md` | Sửa code trong worktree |
| 8 · spec | **Spec gatekeeper** | `spec-prompt.md` | **Chỉ đọc + comment** — không sửa code |
| 9 · reindex | — | — | *Script thuần* |

Mỗi lần gọi model là một lần tốn quota và một lần thêm tính bất định. Việc nào viết được bằng bash thì viết bằng bash. Đẩy commit status, đếm approve, dựng docker compose — không có gì để "suy nghĩ" ở đó cả.

### Vì sao tầng 1 không được dùng LLM

Câu hỏi tự nhiên: sao không để một LLM làm orchestrator luôn cho linh hoạt? Bốn lý do, lý do cuối là lý do quyết định.

**1 · Chi phí phi lý.** Tick 30 giây = **2.880 lần/ngày**. Tuyệt đại đa số tick không có việc gì để làm. Trả tiền cho model để nó nói "không có gì" gần ba nghìn lần mỗi ngày, trong khi `gh issue list | jq` trả lời cùng câu hỏi trong 200ms và tốn 0 đồng.

**2 · Bất định trong tầng điều khiển.** Cùng một trạng thái phải luôn ra cùng một quyết định. Nếu orchestrator ngẫu nhiên, câu hỏi "sao nó build #42 mà không sửa #38 trước?" không có câu trả lời tái hiện được — và bạn mất khả năng debug chính hệ thống của mình.

**3 · Thêm một điểm chết.** API lỗi hoặc hết quota = orchestrator ngừng hoạt động. Bash không có phụ thuộc đó.

**4 · Orchestrator là user cầm token.** Đây mới là lý do thật sự. Một LLM ở tầng 1 là **một tiến trình có thể bị prompt injection, đang cầm `GH_TOKEN` và quyền `git push`** — trong khi đầu vào của nó là tiêu đề issue, comment PR, thông báo lỗi từ tool. Toàn bộ thiết kế hai user ở §3 tồn tại chính là để không có tiến trình nào vừa đọc nội dung không tin cậy vừa cầm credential. Đặt LLM vào tầng 1 là tự tay phá bỏ nó.

**Nguyên tắc rút ra:** *rule quyết định **khi nào**, LLM quyết định **làm gì** bên trong một task.* Mọi phán đoán mơ hồ — spec đã đủ rõ chưa, comment này đòi sửa code hay chỉ hỏi — đều là việc của tầng 2, chạy dưới user không có token.

> **Ngoại lệ hợp lệ:** một lượt *triage* chạy 1–2 lần mỗi ngày (không phải mỗi 30 giây), đọc backlog và **đề xuất** đổi label cho người duyệt. Rẻ, hữu ích, và vẫn không nằm trong vòng lặp nóng.

**Tầng 3** là subagent Claude Code tự spawn bên trong một phiên (như persona `code-reviewer`, `security-auditor` mà `/ship` dùng). Bạn không điều phối tầng này — chỉ cần biết nó tồn tại, vì nó giải thích vì sao một "task" có thể ngốn nhiều turn hơn dự đoán.

### Hai user — ranh giới token

Ở phương án A, ranh giới step của Actions ép sẵn việc agent không cầm token. Ở C ta phải tự dựng — và bản tự dựng thực ra **mạnh hơn**.

| User | Có gì | Không có gì |
|---|---|---|
| `bee-orch` | `GH_TOKEN`, `gh`, quyền `git push`, chạy rule + worker | login Claude Code |
| `bee-agent` | login Claude Code (`~/.claude`) | **token, sudo** |

**Cả 4 vai trò tầng 2 đều chạy dưới cùng một user `bee-agent`.** Vai trò khác nhau ở prompt và tool được phép dùng, không ở danh tính hệ điều hành.

Orchestrator gọi agent qua `sudo`:

```bash
sudo -u bee-agent -H /opt/bee/bin/agent-exec.sh "$WORKTREE" "$PROMPT_FILE"
```

```
# /etc/sudoers.d/bee
bee-orch ALL=(bee-agent) NOPASSWD: /opt/bee/bin/agent-exec.sh
```

**Vì sao hai user chứ không phải hai biến môi trường:** cùng một UID đọc được `/proc/<pid>/environ` của tiến trình cha. Lọc biến môi trường khi spawn không ngăn được điều đó. Khác UID thì kernel chặn — đây là ranh giới thật, không phải quy ước.

Thêm một điểm tiện: `sudo` mặc định bật `env_reset`, tức là môi trường bị dọn sạch trước khi chạy. Bạn được cái bảo đảm "agent không thấy token" **miễn phí, do sudo lo**, không phải tự nhớ lọc.

Thư mục làm việc: `/srv/bee/work/` — group `bee`, setgid, cả hai user đều thuộc group. Agent commit local (không cần token); orchestrator push.

### Vì sao không phải mỗi slot một user

Câu hỏi tự nhiên khi chạy song song: 3 worker thì có cần `bee-agent1/2/3` không?

**Không.** Ranh giới đáng tiền là **agent ↔ orchestrator** (token), không phải agent ↔ agent. Hai agent chạy song song đều không có token, nên cái tệ nhất chúng làm được với nhau là phá worktree của nhau — đó là lỗi tính đúng đắn, không phải lỗ hổng bảo mật, và nó lộ ra ngay khi test đỏ.

Cái giá của N user thì lại thật: **mỗi user cần một lần đăng nhập Claude Code riêng**, nhân lên mỗi khi thêm slot, và làm việc gỡ rối trở nên rối rắm.

Nếu về sau cần cách ly thật giữa các task song song, đường nâng cấp đúng là **container** chứ không phải thêm user: mỗi worker chạy trong một container, bind-mount đúng worktree của nó, giới hạn được cả network. Chỉ làm khi có lý do cụ thể, không làm sẵn.

### ⚠ `bee-agent` tuyệt đối không được vào group `docker`

**Thuộc group `docker` tương đương quyền root.** Bất kỳ ai chạy được `docker` đều có thể:

```bash
docker run -v /:/host alpine cat /host/etc/bee/orch.env    # đọc GH_TOKEN
```

Không có bức tường nào ngăn được — daemon Docker chạy bằng root và vui vẻ mount toàn bộ hệ thống tệp. Nếu agent vào group `docker` thì **toàn bộ thiết kế hai user sụp đổ trong một dòng lệnh**, và không để lại dấu hiệu nào.

| User | Group `docker` | Vì sao |
|---|---|---|
| `bee-orch` | **Có** | Nó dựng service để test, dựng preview env, dọn container |
| `bee-agent` | **Không** | Nó chỉ chạy code trong worktree |

Hệ quả thực tế: **agent không tự `docker compose up` được.** Worker (chạy dưới orch) dựng sẵn Postgres/Redis *trước*, rồi mới gọi agent; agent chỉ chạy `npm test` / `pytest` trên môi trường đã có. Điều này hoá ra lại tốt hơn — môi trường test được dựng bằng script cố định thay vì tuỳ hứng theo từng lần agent quyết định.

> Đây thuộc cùng loại sai lầm với việc quên `persist-credentials: false` ở [AGENT_FLOW §6](AGENT_FLOW.md#6-guardrails): mọi thứ vẫn chạy bình thường, chỉ là ranh giới bảo vệ đã biến mất. `be doctor` phải kiểm dòng này:
>
> ```bash
> id -nG bee-agent | grep -qw docker && echo "NGUY HIỂM" || echo "OK"
> ```

---

## 4. Vòng reconcile

Mỗi tick chạy qua danh sách rule theo thứ tự, gặp rule nào khớp thì **làm rule đó rồi thoát**.

| # | Điều kiện | Hành động | Vì sao ưu tiên vậy |
|---|---|---|---|
| 0 | `.agent/PAUSE` tồn tại trên `main`, hoặc `/etc/bee/PAUSE` | Thoát im lặng | Kill switch |
| 1 | Issue có `agent:running` nhưng không có state local | Reset về `agent:build`, comment cảnh báo | Dọn xác sau khi máy chết |
| 2 | PR mở có review comment `@claude` chưa xử lý | Sửa theo comment | Gỡ chặn cho người đang chờ |
| 3 | PR mở có head SHA chưa có commit status | Chạy CI, đẩy status `bee/test` | PR phải xanh trước khi làm gì tiếp |
| 4 | PR mở đã xanh, evidence block thiếu hoặc SHA cũ | E2E trên stack **localhost** + publish evidence | Bằng chứng phải khớp HEAD |
| 5 | PR mở, số approve thay đổi | Tính lại status `bee/approvals` | Rẻ, chỉ là một lệnh API |
| 6 | PR có `preview:on`, chưa có stack đang chạy | Dựng preview env + comment URL | **Opt-in** — mặc định không dựng |
| 7 | Issue có `agent:build` + `agent:eligible`, WIP < 3 | Build task mới | Việc mới xếp sau cùng |
| 8 | Issue có `status:ready-for-spec` | Chạy `/spec` | |
| 9 | `main` có commit mới kể từ lần index cuối | Index lại GitNexus | Chạy khi rảnh, không chặn ai |
| — | Không khớp gì | Thoát im lặng, ghi heartbeat | |

**Rule 4 không cần preview env.** E2E dựng stack bằng `docker compose up` trên localhost, quay video, rồi tắt — không cần Caddy, cloudflared, hay domain. Đây là lý do bằng chứng làm được sớm (M3) còn preview để mốc cuối (M6). Chi tiết ở [AGENT_FLOW §7.0](AGENT_FLOW.md#70-bằng-chứng--preview).

**Rule 5 là cưỡng chế mềm cho việc PM + TL cùng duyệt.** GitHub Free không enforce required reviewers, nhưng reconciler đếm approve của hai nhóm rồi đẩy commit status — PR hiện dấu tích/dấu X y như có branch protection. Xem [AGENT_FLOW §9.0](AGENT_FLOW.md#90-hai-người-duyệt-hai-việc-khác-nhau).

**Rule 6 chỉ chạy khi có label `preview:on`.** Preview env sống suốt vòng đời PR và ngốn ~1,5GB RAM, nên nó là thứ bật khi cần chứ không mặc định. Teardown khi PR đóng hoặc label bị gỡ.

### 4.1. Phân công: không có quyết định nào để đưa ra

"Phân công task cho agent" nghe như có một bộ lập lịch chọn giữa nhiều agent rảnh. Ở đây **không có lựa chọn nào cả** — ánh xạ rule ↔ vai trò là 1:1 và cố định:

| Trạng thái của item | Rule khớp | Vai trò xử lý |
|---|---|---|
| PR có comment `@claude` chưa xử lý | 2 | Review-fixer |
| PR xanh, thiếu bằng chứng | 4 | Evidence runner |
| Issue `agent:build` + `agent:eligible` | 7 | Builder |
| Issue `status:ready-for-spec` | 8 | Spec gatekeeper |

Một PR có review comment chưa xử lý **chỉ có thể** do Review-fixer làm. Không có tình huống nào hai vai trò cùng tranh một task, nên không cần thuật toán phân công. Bản thân **trạng thái của item quyết định luôn ai xử lý nó**.

Quyết định thật sự chỉ nằm ở chỗ khác: *item nào được chọn tiếp theo.*

### 4.2. Ba tầng ưu tiên

**Tầng 1 — thứ tự rule (tĩnh).** Danh sách 0→9 chính là thứ tự ưu tiên, và nó mã hoá một chính sách: **gỡ chặn người trước, nhận việc mới sau**. Rule 2 (Techlead đang chờ) đứng trên rule 7 (issue nằm im trong hàng đợi).

**Tầng 2 — trong cùng một rule, nhiều ứng viên.** Rule 7 có thể khớp với 5 issue cùng lúc. Sắp xếp bằng hai khoá, không có khoá thứ ba:

```
1. label priority:high   →  lên đầu
2. số issue tăng dần     →  ai vào hàng trước đi trước
```

Số issue là dãy tăng đơn điệu, có sẵn, không tốn lời gọi API, không cần lưu state, và **không thể bị đói** — một issue cũ không bao giờ tụt lại phía sau mãi mãi. `priority:high` là cửa thoát duy nhất cho người, gắn tay khi thật sự cần.

> Nếu về sau muốn đúng nghĩa "theo thứ tự sẵn sàng" (issue được duyệt trước thì chạy trước, bất kể số), reconciler đóng dấu `state/queue/<issue>.seen` lần đầu nhìn thấy rồi FIFO theo `mtime`. Chính xác hơn, nhưng thêm state — chỉ làm khi thứ tự theo số issue thực sự gây khó chịu.

**Tầng 3 — còn slot không.** Đây là điểm tinh tế nhất: một rule **khớp nhưng không dispatch được** thì *không* chặn các rule sau nó.

> Điều kiện dispatch đầy đủ = **điều kiện của rule** ∧ **pool đích còn slot** ∧ **item chưa có unit đang chạy**

Nếu bể build đầy mà bể evidence rảnh, rule 7 bị bỏ qua và rule 4 vẫn chạy. Nếu chỉ đơn giản "gặp rule khớp thì dừng", một hàng đợi build đầy sẽ làm chết luôn việc chạy bằng chứng — hai việc dùng tài nguyên khác nhau, không có lý do gì chặn nhau.

### 4.3. Hai điều tưởng là lỗi nhưng là chủ ý

**Rule 2 có thể làm rule 7 bị đói — và điều đó đúng.** Cả hai dùng chung bể build, nên khi có nhiều PR cần sửa theo review, sẽ không có task mới nào được bắt đầu. Đây chính là kỷ luật WIP: đóng xong việc đang mở trước khi mở việc mới. Và nó **tự giới hạn** — `MAX_WIP=3` chặn số PR mở, nên hàng đợi review có trần, không thể đói vĩnh viễn.

**Một item chỉ có một unit, nhờ GitHub đánh số chung.** Issue và PR dùng chung một dãy số trên GitHub, nên `#42` hoặc là issue hoặc là PR, không bao giờ cả hai. Vì vậy `bee-task@42` là khoá không nhập nhằng, và systemd tự đảm bảo Evidence runner không chạy đè lên Review-fixer trên cùng một PR.

> Một guard nhỏ vẫn cần: rule 7 phải bỏ qua issue đã có PR mở liên kết với nó, phòng trường hợp label bị gắn lại nhầm.

### 4.4. Ai quyết định cái gì

| Quyết định | Ai quyết | Cơ chế |
|---|---|---|
| Agent có được phép nhận task này không | **Người** (PM/TL) | label `agent:eligible` — mặc định không |
| Khi nào bắt đầu | **Người** | label `agent:build` |
| Task này gấp | **Người** | label `priority:high` |
| Vai trò nào xử lý | Trạng thái item | ánh xạ rule ↔ vai trò, 1:1 |
| Việc gì làm trước | Thứ tự rule | tĩnh, đọc được trong 10 giây |
| Item nào trong cùng rule | Rule | `priority:high` → số issue |
| Chạy được ngay không | Slot pool | pool đầy thì xét rule khác |

**Người kiểm soát *cái gì được vào* và *cái gì gấp*. Rule kiểm soát phần còn lại. Không có LLM ở bất kỳ ô nào trong bảng này** — đó là điều làm hệ thống này debug được.

**Nguyên tắc xếp thứ tự: xong việc đang dở trước khi nhận việc mới.** Rule 2 đứng trên rule 5 vì một Techlead đang chờ agent sửa comment thì đắt hơn một issue nằm im trong hàng đợi. Đây là thứ Actions không cho bạn — ở đó mọi event bình đẳng, cái nào đến trước chạy trước.

**Rule 3 biến reconciler thành CI luôn.** Không cần GitHub Actions cho test: chạy test trên PC (có Postgres/Redis thật, nhanh hơn hosted runner nhiều), rồi đẩy kết quả lên PR bằng Commit Status API:

```bash
gh api "repos/$REPO/statuses/$SHA" -f state=success \
  -f context="bee/test" -f target_url="$LOG_URL"
```

PR hiện dấu tích xanh y như Actions. Và nó áp dụng cho **cả PR do người mở**, không riêng PR của agent — reconciler không phân biệt.

---

## 5. Trạng thái, khoá, và phục hồi

### Khoá

Không cần khoá phân tán — chỉ có một máy. Ba tầng khoá, mỗi tầng do systemd lo:

| Chống | Cơ chế |
|---|---|
| Reconciler chạy chồng chính nó | `Type=oneshot` + `OnUnitInactiveSec` |
| Hai worker trên cùng issue | Template unit `bee-task@42` — systemd từ chối start unit đã active |
| Quá số slot | Reconciler đếm `systemctl list-units 'bee-task@*'` trước khi dispatch |

Việc đổi label `agent:build` → `agent:running` **không phải khoá** — nó chỉ để con người nhìn thấy agent đang làm gì. Khoá thật nằm ở tên unit.

### State trên đĩa

```
/srv/bee/state/<issue>/
├── claim.json      # {issue, pr, branch, started_at, session_id, attempt}
├── run.jsonl       # log stream-json đầy đủ của lần chạy hiện tại
└── worktree        # symlink tới /srv/bee/work/issue-<n>
```

`session_id` lấy từ dòng `result` của stream-json, cho phép `claude --resume` ở vòng review sau — agent nhớ được lý do nó đã làm như vậy thay vì đọc lại diff từ đầu. **Đây là thứ Actions làm rất vướng còn C làm dễ.**

> Đây là *một* trong bốn loại trí nhớ của hệ thống, và là loại duy nhất reconciler chịu trách nhiệm. Ba loại còn lại (quy ước dự án, bài học, cấu trúc codebase) nằm trong git và GitNexus — xem [AGENT_FLOW §10](AGENT_FLOW.md#10-trí-nhớ-của-agent).

### Phục hồi sau sự cố

Rule 1 tồn tại vì mất điện là chuyện sẽ xảy ra. Điều kiện phát hiện gọn hơn nhờ template unit:

> Issue mang label `agent:running`, nhưng `bee-task@<issue>` **không active** → chết giữa chừng.

Không phải kiểm tra PID, không phải xử lý PID mồ côi bị hệ điều hành cấp lại cho tiến trình khác. Unit `failed` cũng nhìn thấy được bằng `systemctl`, và log của lần chết đó vẫn còn nguyên trong `journalctl -u bee-task@42`.

```
attempt < 2  →  reset về agent:build, xoá worktree, comment "lần trước bị gián đoạn, chạy lại"
attempt >= 2 →  gắn needs-human, dừng hẳn
```

Không retry vô hạn. Hai lần fail liên tiếp gần như luôn là task có vấn đề, không phải máy có vấn đề.

### Kill switch hai tầng

- **`/etc/bee/PAUSE`** — dừng ngay, dùng khi bạn đang ngồi trước máy
- **`.agent/PAUSE` trên nhánh `main`** — PM tạo file qua giao diện web GitHub trong 10 giây, không cần SSH, và **lưu vết trong lịch sử git**: ai dừng, lúc nào, vì sao (commit message)

Tầng thứ hai quan trọng hơn vẻ ngoài của nó: người phát hiện agent đang làm bậy thường không phải người có SSH.

---

## 6. Worktree

Một clone bare trung tâm + worktree cho từng task:

```bash
git -C /srv/bee/repo.git worktree add \
    /srv/bee/work/issue-42 -b feat/42-slug origin/main
```

- Task hỏng thì `worktree remove --force` là sạch, không ảnh hưởng cái khác
- Chạy song song 2–3 task không giẫm chân nhau khi cần mở rộng sau này
- Cache ngoài worktree (`~/.npm`, `~/.cache/ms-playwright`, docker layer) vẫn dùng chung, luôn ấm

Dọn worktree khi PR đóng, cộng một lượt quét mồ côi mỗi đêm.

---

## 7. Chạy agent

`agent-exec.sh` chạy dưới `bee-agent`, không có token:

```bash
timeout "${AGENT_TIMEOUT:-30m}" \
claude -p "$(cat "$PROMPT_FILE")" \
  --output-format stream-json --verbose \
  --dangerously-skip-permissions \
  --max-turns "${MAX_TURNS:-80}" \
  ${RESUME_ID:+--resume "$RESUME_ID"} \
  | tee "$RUN_LOG"
```

Orchestrator bóc dòng cuối `"type":"result"` để lấy `session_id`, `num_turns`, `duration_ms`, `is_error`.

**Ba chốt chặn:** `timeout` bash 30 phút · `TimeoutStartSec=45min` ở systemd · `--max-turns 80`. Với gói thuê bao thì chi phí không đo được bằng tiền — theo dõi bằng **turn và thời lượng**.

Prompt dựng từ template `.github/agent/*.md`, chèn nội dung issue lấy sẵn bởi orchestrator (bước có token) rồi ghi ra file. Agent đọc file, không tự gọi `gh`.

### 7.1. Agent lấy database và `.env` ở đâu, khi không có Docker

Agent không thuộc group `docker` (§3), nên nó không tự dựng được Postgres/Redis. Lời giải: **tách "dựng hạ tầng" khỏi "dùng hạ tầng"**.

```
worker (orch)                              agent
─────────────────────────────────────      ──────────────────────────
1. docker compose up -d  (db, redis)
2. đọc cổng động đã cấp
3. ghi .env.test vào worktree
4. gọi agent  ───────────────────────►     5. npm test / pytest
                                              kết nối TCP tới localhost:PORT
                                              (không cần Docker)
                                           6. npm run dev / playwright
◄──────────────────────────────────────       (tiến trình thường)
7. docker compose down -v
```

Ranh giới dễ nhớ: **Docker chỉ chạy hạ tầng phụ trợ (Postgres, Redis, RabbitMQ, MinIO) và do orch quản. Bản thân ứng dụng và test là tiến trình thường, chạy dưới agent.** Playwright cũng vậy — `webServer` trong config tự khởi động `npm run dev`, đó chỉ là một tiến trình, không cần Docker.

#### Cổng động, để không đụng nhau

Compose khai báo cổng **không cố định host port**:

```yaml
services:
  db:
    image: postgres:16
    ports: ["5432"]        # ← không phải "5432:5432"
```

Docker tự cấp một cổng rỗi; worker đọc lại bằng `docker compose -p "$STACK" port db 5432`. Nhờ vậy ba worker song song không đụng nhau, và cũng không đụng con Postgres bạn đang chạy trên cổng 5432 cho việc riêng ([§16.3](#163-dùng-chung-máy--vừa-chạy-agent-vừa-làm-việc)).

#### `.env.test` không chứa bí mật nào

Đây là chỗ hay bị lo lắng nhầm. Nguyên tắc ở [AGENT_FLOW §6](AGENT_FLOW.md#6-guardrails) là "agent chỉ thấy `.env.example`" — nhưng test thì cần config thật để chạy. Giải quyết bằng cách phát biểu lại nguyên tắc cho chặt hơn:

> **Mọi thứ agent nhìn thấy đều phải là thứ không đáng ăn cắp.**

```bash
# .env.test — worker sinh ra, ghi vào worktree
DATABASE_URL=postgresql://test:test@localhost:49187/app_test
REDIS_URL=redis://localhost:49188/0
S3_ENDPOINT=http://localhost:49189      # MinIO tạm, bucket rỗng
JWT_SECRET=test-only-not-a-real-secret
STRIPE_KEY=sk_test_stub
```

Tài khoản của một container Postgres sống 20 phút rồi bị `down -v` xoá sạch thì lộ cũng chẳng mất gì. Còn secret thật — DB production, khoá S3 thật, API key trả tiền — **không bao giờ có mặt trong worktree**, chúng nằm ở `/etc/bee/` mà agent không đọc được.

> Nếu một test *bắt buộc* phải có credential thật mới chạy được, đó là tín hiệu thiết kế: test đó nên dùng stub hoặc sandbox key. Đừng nới lỏng ranh giới để chiều một test viết chưa tốt.

#### Compose file lấy từ `main`, không lấy từ worktree

Chi tiết nhỏ nhưng quan trọng. Worker phải dùng:

```bash
git show origin/main:infra/docker-compose.test.yml
```

**Không** dùng bản trong worktree. Lý do: agent sửa được mọi file trong worktree, kể cả compose file — và một compose file có thể khai báo `privileged: true` hoặc `volumes: ["/:/host"]`. Nếu orch chạy compose file do agent viết thì agent vừa thoát ra quyền root, đúng bằng con đường mà §3 vừa bịt.

Hệ quả thực tế: **task cần thêm service mới (ví dụ Elasticsearch) phải tách làm hai PR** — một PR sửa compose file cho người duyệt và merge, rồi mới tới task tính năng. Đây là ma sát có chủ đích: thay đổi hạ tầng nên được review riêng, không lẫn vào một PR tính năng.

#### Agent cần reset dữ liệu giữa các test thì sao

Không cần Docker cho việc này. Dọn bằng chính kết nối database — `TRUNCATE`, hoặc bọc mỗi test trong một transaction rồi rollback. Cách này còn nhanh hơn khởi động lại container nhiều lần.

Nếu agent thấy mình *cần* restart container, gần như luôn là dấu hiệu test đang phụ thuộc vào trạng thái toàn cục — sửa test, đừng mở quyền.

---

## 8. Báo cáo ngược — phần Actions cho không, giờ phải tự làm

Đây là chi phí thật của phương án C. Không giải quyết tử tế thì sau hai tuần không ai biết agent đang làm gì.

**Bốn kênh, xếp theo thứ tự nên làm:**

**1. Comment tổng kết trên issue/PR** — bắt buộc, làm ngay. Sau mỗi lần chạy:

```markdown
<!-- agent-run -->
🤖 **build** · 34 turns · 12m41s · `session a1b2c3`
Đã tạo #58 · [log đầy đủ](https://minio.../runs/42-1739.jsonl)
**Không chắc:** logic refresh token khi hai tab cùng mở — chưa test.
```

Đặt log ở nơi cả đội đã nhìn hằng ngày, không bắt ai mở terminal. Dùng marker `<!-- agent-run -->` để cập nhật thay vì chất đống.

**2. Log đầy đủ lên MinIO** — bucket đã có sẵn cho evidence, thêm prefix `runs/`. Link từ comment. Giữ 30 ngày.

**3. Commit status** — dấu tích xanh/đỏ trên PR (rule 3).

**4. Dashboard** — xem §8.1 ngay dưới.

### 8.1. Dashboard quản lý & giám sát

Đây là thứ bù lại phần Actions cho không nhiều nhất, và nó đáng làm **sớm** — không phải mốc cuối.

**Nó không cần backend.** Reconciler mỗi tick vốn đã tính đủ mọi thứ để ra quyết định; chỉ cần ghi thêm một file. Caddy phục vụ thư mục bằng `file_server`. Không framework, không build step, không cơ sở dữ liệu.

```
/srv/bee/public/
├── index.html        # trang tĩnh, vanilla JS, poll status.json mỗi 5s
└── status.json       # reconciler ghi đè mỗi tick
```

#### Với nhiều repo, đây là hai câu hỏi khác nhau

Dashboard một repo là một danh sách phẳng. Với ba repo, người xem hỏi hai câu chẳng liên quan gì nhau:

| Câu hỏi | Người hỏi | Cần nhìn theo |
|---|---|---|
| "Máy đang làm gì? Có nghẽn không?" | Người vận hành | **Trạng thái** — slot, heartbeat, cái gì đang chạy |
| "Dự án của tôi tới đâu rồi?" | PM / TL của một repo | **Repo** — hàng đợi, PR gần đây, WIP |

Gộp hai câu này vào một danh sách là hỏng cả hai. Nên chia **hai vùng**:

```
┌── VÙNG 1 · sức khoẻ hệ thống ──────────────────────────┐
│  heartbeat · slot toàn cục · thống kê hôm nay          │
│  cần chú ý  (chỉ hiện khi có)                          │
│  đang chạy  (mọi repo — đây là bức tranh chiếm slot)   │
├── VÙNG 2 · thẻ theo repo ──────────────────────────────┤
│  ┌ myapp ┐ ┌ shop ┐ ┌ blog ┐                       │
│  │ hàng đợi  │ │ ...  │ │ ...  │                       │
│  │ gần đây   │ │      │ │      │                       │
│  └───────────┘ └──────┘ └──────┘                       │
└────────────────────────────────────────────────────────┘
```

"Đang chạy" **chỉ nằm ở vùng 1**, không lặp lại trong thẻ repo — nó là bức tranh chiếm slot, mà slot là tài nguyên chung. Thẻ repo chỉ giữ hàng đợi, lịch sử và bộ đếm.

#### Trường quan trọng nhất: `wait_reason`

Với một repo, "đang chờ" là đủ. Với nhiều repo, câu hỏi số một của PM sẽ là *"sao task của tôi chưa chạy?"* — và nếu dashboard không trả lời, họ sẽ nhắn hỏi bạn.

Mỗi item trong hàng đợi phải nói rõ **vì sao nó chờ**:

- `chờ slot build (toàn cục 3/3)` — hệ thống đầy, không phải lỗi ai
- `repo đã dùng 2/2 slot` — chính repo này đang chiếm phần của mình
- `sau #38 (priority:high)` — có việc gấp hơn chen lên
- `chờ người duyệt spec` — đang chờ chính PM đó

Đây là thay đổi có giá trị cao nhất khi lên nhiều repo: nó biến một câu hỏi hỗ trợ thành một câu trả lời tự phục vụ.

#### `status.json`

```jsonc
{
  "heartbeat": "2026-08-11T17:42:03Z",
  "tick_ms":   830,
  "paused":    false,
  "slots": {
    "build":    { "used": 2, "max": 3, "per_repo_max": 2 },
    "evidence": { "used": 1, "max": 1 }
  },
  "today":     { "tasks": 7, "turns": 214, "duration_s": 7860 },
  "attention": [ { "repo": "shop", "number": 33,
                   "reason": "needs-human — thất bại 2 lần" } ],
  "running":   [ { "id": "myapp-42", "repo": "myapp", "number": 42,
                   "rule": "07-build", "title": "Thêm filter cho danh sách profile",
                   "elapsed_s": 712, "turns": 34 } ],
  "repos": [
    { "slug": "myapp", "full": "org/myapp",
      "enabled": true, "paused": false,
      "running": 2, "wip": { "open_prs": 2, "max": 3 },
      "queue":  [ { "number": 44, "rule": "07-build", "title": "Export CSV",
                    "wait_reason": "repo đã dùng 2/2 slot" } ],
      "recent": [ { "number": 39, "rule": "04-evidence", "result": "ok",
                    "turns": 12, "duration_s": 403, "pr": 58 } ] }
  ]
}
```

#### Ba quy tắc trình bày

**1 · Thứ tự thẻ repo phải ổn định.** Xếp theo tên, không theo mức hoạt động. Trang tự làm mới mỗi 5 giây; nếu sắp theo số task đang chạy thì thẻ sẽ nhảy chỗ ngay lúc bạn đang đọc.

**2 · "Cần chú ý" vắng mặt khi không có gì.** Một khối luôn hiển thị dù rỗng sẽ bị mắt bỏ qua sau ba ngày. Chỉ render khi `attention` không rỗng — lúc đó nó mới thực sự thu hút.

**3 · `paused` phải hiện ở đúng cấp.** `.agent/PAUSE` nằm *trong* repo nên tạm dừng là **theo từng repo**, không phải toàn hệ thống. Thẻ repo bị dừng phải nhìn ra ngay, nếu không bạn sẽ mất nửa giờ tìm xem sao nó không chạy.

#### Bộ lọc, khi nào cần

Từ khoảng 4 repo trở lên, thêm một hàng chip bật/tắt theo repo, lưu vào `localStorage`. Dưới 4 repo thì không cần — thêm bộ lọc vào một trang chỉ có 2 thẻ là thêm việc mà không thêm thông tin.

**Ràng buộc quan trọng nhất: dashboard không được phụ thuộc vào reconciler còn sống.** Nếu trang do chính reconciler phục vụ, thì lúc reconciler chết bạn mở trang ra chỉ thấy lỗi kết nối — đúng lúc cần biết chuyện gì đang xảy ra thì không biết được gì. File tĩnh + Caddy tách rời hai số phận: reconciler chết, trang vẫn lên, và `heartbeat` cũ 10 phút hiện thành báo động đỏ. Đây chính là cách bạn phát hiện chế độ hỏng nguy hiểm nhất ở §13.

#### Đừng để public thật

Bạn đã có Cloudflare Tunnel — cho dashboard một hostname riêng `agent.yourdomain.com` và **bắt buộc bật Cloudflare Access**, whitelist 3 email.

Lý do không phải hình thức: **log build rò rỉ bí mật**. Output của `journalctl` chứa connection string, biến môi trường in ra khi lỗi, đôi khi cả token trong thông báo lỗi của thư viện. Một trang xem log mở cho internet là một vụ lộ credential đang chờ xảy ra. Ngoài ra tiêu đề issue và đường dẫn file cũng là thông tin nội bộ.

> **Dashboard dễ hơn preview env rất nhiều** — nó cần *một* hostname tĩnh, không cần wildcard DNS, không cần định tuyến theo PR, không cần compose per-PR. Vì vậy nó làm được từ M2 dù preview để tận M6. Giai đoạn đầu thậm chí chỉ cần `http://localhost:8787`, mở tunnel khi nào muốn PM/TL cùng nhìn.

#### Lộ trình hai bước

| Bước | Nội dung | Rủi ro |
|---|---|---|
| **Chỉ đọc** (M2) | Đang chạy, hàng đợi, slot, 20 lần chạy gần nhất, heartbeat, link tới log trên MinIO | Gần như không — chỉ là file tĩnh |
| **Có điều khiển** (sau M5) | Nút Pause, Retry task, Cancel unit, chỉnh số slot | Cần đường ghi + xác thực → chỉ làm khi bước 1 đã dùng thật và thấy thiếu |

Bước 2 cài đặt gọn nhất là **ghi vào GitHub, không ghi vào máy**: nút "Pause" tạo file `.agent/PAUSE` qua GitHub API; nút "Retry" gỡ rồi gắn lại label. Như vậy đường điều khiển vẫn đi qua đúng nguồn sự thật, có lưu vết ai bấm gì, và dashboard không cần quyền gì trên máy chủ.

**Heartbeat:** mỗi tick ghi timestamp vào `/srv/bee/state/heartbeat`. Một systemd timer riêng kiểm tra, quá 10 phút không đổi thì gửi cảnh báo. Reconciler chết im lặng là chế độ hỏng nguy hiểm nhất của C — Actions thì bạn thấy job fail, còn ở đây nó chỉ đơn giản là *không có gì xảy ra cả*.

---

## 9. Đối chiếu: mất gì, được gì

| Actions cho sẵn | Ở C phải làm | Công |
|---|---|---|
| Log streaming, lịch sử | Comment + MinIO + trang status | ~nửa ngày |
| Quản lý secret | `EnvironmentFile` root-only + hai user | ~1 giờ |
| Timeout, cancel | `timeout` + `TimeoutStartSec` | ~15 phút |
| Xếp hàng, chống trùng | `OnUnitInactiveSec` | ~0 |
| Re-run thủ công | Gỡ label rồi gắn lại | ~0 |
| Audit ai kích hoạt | Lịch sử label trên issue | ~0 |
| Ranh giới step ép tách token | sudo + hai user | ~1 giờ |

| Chỉ C mới có | Giá trị |
|---|---|
| Hàng đợi có ưu tiên | Việc gỡ chặn người vượt trước việc mới |
| `--resume` xuyên nhiều lần chạy | Agent nhớ lý do quyết định, không đọc lại diff |
| Không mất việc khi máy tắt | Bật lên chạy tiếp, không cần biết đã lỡ gì |
| CI trên phần cứng của mình | Postgres/Redis thật, nhanh hơn, không tốn phút |
| Không phụ thuộc GitHub | Đổi tracker chỉ sửa lớp query |
| Reconciler cũng chạy CI cho PR của người | Không cần dựng CI riêng |

Tổng công thêm so với A: **khoảng 1,5–2 ngày**. Đổi lại là một hệ thống không mất việc, biết ưu tiên, và không khoá vào GitHub.

---

## 10. Cấu hình

```
/etc/bee/
├── orch.env      # GH_TOKEN, REPO, MINIO_*  — root:root 0600
├── config.env    # POLL_INTERVAL, MAX_TURNS, MAX_WIP, AGENT_TIMEOUT — đọc được
└── PAUSE         # tồn tại = dừng
```

`GH_TOKEN` dùng fine-grained PAT: `Contents: write` + `Pull requests: write` + `Issues: write`. **Cố ý không cấp `Workflows`** — giữ nguyên guardrail từ AGENT_FLOW §6, dù giờ không dùng Actions thì vẫn nên chặn, phòng khi sau này thêm.

---

## 11. Danh sách file

```
/opt/bee/bin/            # triển khai trên PC (nguồn trong repo tại infra/reconciler/)
├── reconcile.sh              # DISPATCHER: chọn 1 việc, systemd-run, thoát. Luôn < 5s
├── worker.sh                 # chạy trong bee-task@<n>, làm việc dài
├── rules/
│   ├── 01-recover-stale.sh
│   ├── 02-review-feedback.sh
│   ├── 03-run-ci.sh
│   ├── 04-evidence.sh
│   ├── 05-approvals.sh
│   ├── 06-preview.sh         # M6, opt-in
│   ├── 07-build-task.sh
│   ├── 08-spec.sh
│   └── 09-reindex.sh
├── lib/
│   ├── github.sh             # bọc gh: query, label, comment, status
│   ├── state.sh              # claim/release/recover
│   ├── worktree.sh
│   └── report.sh             # comment tổng kết, upload log
└── agent-exec.sh             # ← chạy dưới bee-agent, KHÔNG token

infra/reconciler/
├── bootstrap.sh              # tạo user, group, thư mục, sudoers, cài toolchain
├── bee-reconcile.service      # dispatcher, TimeoutStartSec=120
├── bee-reconcile.timer        # OnUnitInactiveSec=30s
├── bee-task@.service          # ← template unit, %i = số issue/PR
├── bee-heartbeat.{service,timer}
└── sudoers.d-bee

.github/                      # vẫn dùng, chỉ là không có workflows
├── ISSUE_TEMPLATE/task.yml
├── pull_request_template.md
├── labels.yml
└── agent/
    ├── build-prompt.md
    ├── spec-prompt.md
    └── review-fix-prompt.md
```

Thư mục `.github/workflows/` **trống** — đây là hệ quả trực tiếp của việc chọn C.

---

## 12. Thứ tự triển khai

Theo năng lực, không theo lịch. Mỗi mốc phải chạy thật trước khi sang mốc sau.

**M0 · Khung chạy khô.** systemd timer + `reconcile.sh` chỉ *in ra* nó định làm gì, không làm gì cả. Hai user, sudoers, worktree, state dir, template unit. Xác nhận: tick đều đặn, thấy đúng issue, không chồng tick, `PAUSE` dừng được, `bee-task@42` không start được lần thứ hai khi đang chạy.
→ *Đây là mốc quan trọng nhất. Đừng cho agent chạy thật cho tới khi bạn tin cái vòng lặp.*

> **Chạy song song có ngay từ M0**, không phải tính năng thêm sau. Dispatcher + template unit + đếm slot là kiến trúc nền — nhét vào sau sẽ phải viết lại `reconcile.sh`. Chỉ cần đặt `MAX_BUILD_SLOTS=1` lúc đầu để dễ quan sát, rồi nâng lên khi đã tin.

**M1 · Rule 7 — build.** Issue → worktree → agent → commit → push → draft PR → comment tổng kết. Chạy 5 task nhỏ và rõ (CRUD, form, bug đã tái hiện được). Ghi `docs/agent-log/<issue>.md` sau mỗi task.
→ *Xong khi: 3/5 task ra PR không cần can thiệp tay.*

**M2 · Rule 1 + 3 + dashboard — phục hồi, CI & giám sát.** Rút điện giữa lúc agent đang chạy, xem có tự dọn không. Commit status `bee/test` hiện trên PR. Dashboard chỉ-đọc (§8.1) — ban đầu chỉ cần `localhost`, mở tunnel khi muốn PM/TL cùng nhìn.
→ *Xong khi: rút điện xong bật lên, hệ thống tự về trạng thái sạch, và bạn nhìn dashboard là biết nó đang làm gì.*

**M3 · Rule 4 + 5 — bằng chứng & cổng duyệt.** E2E trên stack localhost, video → MinIO, nối `publish-evidence.sh` đã có. Cộng status `bee/approvals` cho PM + TL. **Không đụng gì tới Caddy/cloudflared/domain ở mốc này.**
→ *Xong khi: PM mở PR, xem GIF chạy inline, tick đủ AC rồi Approve — không cần hỏi bạn câu nào và không cần preview env.*

**M4 · Rule 2 — vòng feedback.** `@claude` trên review comment, dùng `--resume` nối session. Áp dụng cho cả comment của TL (trên diff) và PM (trên PR).
→ *Xong khi: Techlead comment, agent sửa đúng chỗ, không cần giải thích lại bối cảnh.*

**M5 · Rule 8 + 9 + quan sát.** Spec gatekeeper, index lại GitNexus, trang trạng thái, cảnh báo heartbeat.

**M6 · Rule 6 — preview env (opt-in).** Caddy + cloudflared + Cloudflare Access + compose per-PR, bật bằng label `preview:on`.
→ *Đến mốc này mới cần domain và tunnel. Nếu M3 đã đủ cho PM duyệt, mốc này có thể hoãn vô thời hạn.*

**M7 · UI feedback widget.** `file:line` qua `react-dev-inspector`. Phụ thuộc M6 (widget nhúng trong preview build), và chỉ đáng làm khi vòng lặp cơ bản đã ổn định.

---

## 13. Rủi ro riêng của C

| Rủi ro | Vì sao nguy hiểm | Xử lý |
|---|---|---|
| **Reconciler chết im lặng** | Không có job đỏ để nhìn thấy — chỉ là không có gì xảy ra | Heartbeat + cảnh báo, mốc M0 |
| Rule khớp sai, lặp vô hạn một hành động | Đốt quota trong đêm | Mỗi tick 1 hành động + `attempt` counter + `needs-human` sau 2 lần |
| State đĩa lệch với GitHub | Agent tưởng đang làm việc đã xong | GitHub luôn thắng; state đĩa chỉ là cache, rule 1 dọn |
| Bug trong `reconcile.sh` giống bug của agent | Không biết lỗi ở đâu | M0 chạy khô trước; giữ rule ngắn, mỗi file một việc |
| Quên `env_reset` / sudoers sai | Agent cầm token mà không ai biết | Kiểm tra ở M0: `sudo -u bee-agent env \| grep -i token` phải rỗng |
| Rate limit GitHub API | 30s/lần × nhiều query | Gộp query, cache ETag, nới lên 60s nếu cần |
| **Việc dài lọt vào reconciler** | Cả hệ thống nghẽn sau một task chậm | `TimeoutStartSec=120` giết tick — bug lộ ngay thay vì âm ỉ |
| E2E song song làm nhau flaky | Test đỏ ngẫu nhiên, không tái hiện được | Bể evidence cố định = 1 slot |
| Quota Claude cạn nhanh gấp N lần | Rate limit giữa ngày | Giảm `MAX_BUILD_SLOTS` trước khi nghĩ tới nâng máy |
| Hai agent song song phá worktree nhau | Test đỏ khó hiểu | Mỗi task một worktree; nếu cần thật thì chuyển sang container |

Ba hàng đầu là ba thứ Actions vốn lo hộ. Chúng là cái giá của C — trả bằng công ở M0 và M2, trả một lần.

---

## 14. Kiểm thử trước khi tin

Trước khi để hệ thống chạy không giám sát:

- [ ] `sudo -u bee-agent env | grep -iE 'token|key'` → **rỗng**
- [ ] `sudo -u bee-agent git push` trong worktree → **fail**
- [ ] Rút điện giữa lúc agent chạy → bật lên, rule 1 dọn sạch trong 1 tick
- [ ] Tạo `.agent/PAUSE` qua web GitHub → tick sau dừng
- [ ] Hai tick không bao giờ chồng nhau (`journalctl -u bee-reconcile`)
- [ ] `systemctl start bee-task@42` lần hai khi đang chạy → **bị từ chối**
- [ ] Mỗi tick reconciler kết thúc trong **< 5 giây** kể cả khi 3 worker đang chạy
- [ ] Đầy slot → tick sau không dispatch thêm, thoát im lặng
- [ ] `kill -9` một worker → rule 1 dọn trong 1 tick, unit ở trạng thái `failed` xem được
- [ ] Task fail 2 lần → `needs-human`, không chạy lần 3
- [ ] Ngắt mạng 10 phút → không mất việc, không kẹt state
- [ ] Heartbeat cũ 10 phút → cảnh báo bắn

---

## 15. Nhiều repo

Thiết kế ở trên ngầm định **một repo**. Đây là những gì vỡ khi thêm repo thứ hai, và cách sửa.

### 15.1. Cái gì vỡ

| Vỡ | Vì sao |
|---|---|
| **Tên unit** | `bee-task@42` — số 42 tồn tại ở *mọi* repo. Hai repo cùng có issue #42 sẽ tranh nhau một unit |
| Config | `orch.env` chỉ có một biến `REPO` |
| Bare clone | `/srv/bee/repo.git` là số ít |
| Hostname preview | `pr-42.domain` đụng nhau giữa các repo |
| Slot | Toàn cục — một repo bận có thể chiếm sạch, repo khác chết đói |

Cái đầu tiên là nghiêm trọng nhất: nó phá luôn cơ chế khoá, và biểu hiện là hai worker khác repo ghi đè state của nhau.

### 15.2. Định danh: `<slug>-<số>`

```
bee-task@myapp-42.service
bee-task@shop-42.service
```

Slug lấy từ tên repo, chỉ chữ thường + số + gạch ngang. Nếu tên repo có ký tự lạ thì cho qua `systemd-escape` trước khi ghép.

### 15.3. Cấu hình tách theo repo

```
/etc/bee/
├── bee.env          # toàn cục: slot, timeout, MinIO, Cloudflare
└── repos.d/
    ├── myapp.env     # REPO=org/myapp, REVIEWERS_PM=…, ENABLED=1
    └── shop.env
```

Reconciler duyệt `repos.d/*.env`. Tắt một repo = `ENABLED=0`, không phải gỡ cài đặt.

```
/srv/bee/
├── repos/<slug>.git          # bare clone mỗi repo
├── work/<slug>-42/           # worktree
├── state/<slug>/42/
└── public/status.json        # dashboard gộp mọi repo
```

### 15.4. Lịch: rule trước, rồi công bằng giữa repo

Câu hỏi: quét hết rule của repo A rồi mới sang repo B, hay quét rule 2 cho *mọi* repo trước?

**Rule trước, repo sau.** Chính sách "gỡ chặn người trước, việc mới sau" là chính sách về **thời gian của con người**, không phải về repo. Một Techlead đang chờ ở repo B không nên phải xếp hàng sau đống task mới của repo A.

Khoá sắp xếp trong một rule, mở rộng từ §4.2:

```
1. label priority:high
2. số unit đang chạy của repo đó   ← tăng dần: repo ít việc được ưu tiên
3. số issue                        ← tăng dần
```

Khoá thứ 2 là toàn bộ cơ chế công bằng: repo đang chiếm 2 slot tự động xếp sau repo đang chiếm 0 slot. **Tự cân bằng, không cần lưu state round-robin, không thể đói.**

### 15.5. Slot: toàn cục, kèm trần mỗi repo

RAM là tài nguyên chung nên trần tổng phải chung:

```bash
MAX_BUILD_SLOTS=3        # toàn cục — quyết định bởi RAM
MAX_PER_REPO=2           # một repo không được chiếm cả 3
MAX_EVIDENCE_SLOTS=1     # vẫn là 1, lý do ở §2.3
```

`MAX_WIP` thì ngược lại — **đặt theo từng repo**, vì nó giới hạn khả năng review của người, mà mỗi repo có thể do người khác review.

### 15.6. Preview & dashboard

Hostname thành `<slug>-<pr>.yourdomain.com` — vẫn một cấp subdomain nên Universal SSL miễn phí vẫn phủ ([AGENT_FLOW §7](AGENT_FLOW.md#7-preview-environment)). Caddy đổi từ `{labels.2}` tách chuỗi thành: `myapp-58` → container `myapp-58-frontend`. Không phải sửa Caddyfile mỗi lần thêm repo.

`status.json` thêm trường `repo` cho mỗi dòng; dashboard nhóm theo repo hoặc thêm một cột.

### 15.7. Cái gì KHÔNG đổi

- **Vẫn hai user cho tất cả repo.** Ranh giới đáng tiền là agent ↔ orchestrator, không phải repo ↔ repo. Thêm user cho mỗi repo lại quay về bài toán mỗi user một lần login Claude Code.
- `AGENTS.md`, `.claude/`, `.agent/PAUSE` vốn nằm *trong* repo nên tự động tách sẵn — không phải làm gì.
- GitNexus index vốn theo repo.
- Toàn bộ §2 (dispatcher/worker), §3 (hai user), §5 (khoá) giữ nguyên.

> **Ngoại lệ:** nếu có repo của khách hàng với mức tin cậy khác, lúc đó container mới đáng — mỗi worker một container, giới hạn cả network. Chỉ làm khi có repo thật sự cần.

### 15.8. Điều quan trọng nhất

**Thêm repo không thêm năng lực — nó chia nhỏ năng lực sẵn có.** Quota Claude, RAM, và số slot đều là chung. Ba repo cùng chạy nghĩa là mỗi repo được một phần ba, không phải mỗi repo được 3 slot.

Cụ thể với 32GB và gói thuê bao hiện tại: **2–3 repo hoạt động cùng lúc là hợp lý**. Nhiều hơn thì trần quota sẽ khiến mọi repo đều chậm, và bạn sẽ tưởng hệ thống hỏng trong khi nó chỉ đang bị chia phần.

---

## 16. Cài đặt

Hai lớp: một **installer chạy một lần**, và một **CLI dùng hằng ngày**.

### 16.1. `install.sh` — idempotent, chạy lại vô hại

```bash
git clone git@github.com:org/bee-agent-flow.git ~/bee-src
sudo ~/bee-src/infra/install.sh
```

*(Repo private nên không dùng được `curl | bash` — phải clone trước, và bạn cũng cần `gh auth` sẵn.)*

Nó làm:

| Bước | Nội dung |
|---|---|
| 1 | Kiểm tra Ubuntu 22.04/24.04, quyền root, RAM ≥ 16GB |
| 2 | apt: git, jq, ffmpeg, python3, build-essential |
| 3 | Docker + compose plugin, Node 20, `gh`, `mc`, `cloudflared` |
| 4 | Tạo user `bee-orch`, `bee-agent`, group `bee` |
| 5 | Thư mục `/srv/bee/{repos,work,state,public}`, `/etc/bee/repos.d` |
| 6 | `/etc/sudoers.d/bee` — chỉ một dòng, chỉ một lệnh |
| 7 | Cài `/opt/bee/bin/*`, `/opt/bee/rules/*` |
| 8 | systemd: `bee-reconcile.{service,timer}`, `bee-task@.service`, heartbeat |
| 9 | Playwright + Chromium dưới user `bee-agent` |
| 10 | Tắt sleep/hibernate |
| 11 | **In checklist việc cần làm bằng tay** |

**Nguyên tắc: script làm hết phần không tương tác, rồi in ra danh sách phần bắt buộc phải có người.** Đừng cố tự động hoá bốn thứ này — chúng cần trình duyệt hoặc quyết định của người:

```
[ ] sudo -u bee-agent -H claude          → /login
[ ] sudo -u bee-orch -H gh auth login
[ ] cloudflared tunnel login && tunnel create
[ ] điền /etc/bee/bee.env (MinIO, tunnel id)
[ ] be repo add org/myapp
[ ] be doctor
```

### 16.2. `bee` — CLI vận hành

```bash
be doctor                  # kiểm tra toàn bộ, in PASS/FAIL
be repo add org/myapp  # clone bare, tạo repos.d/*.env, sync label, index GitNexus
be repo list | disable <slug>
be status                  # như dashboard, dạng text
be logs myapp-42       # journalctl -u bee-task@myapp-42
be pause | resume
be dry-run                 # chạy reconcile ở chế độ chỉ in, không làm
```

**`be doctor` là lệnh giá trị nhất** — nó là toàn bộ checklist §14 viết thành mã chạy được:

```
✓ systemd timer đang chạy, tick gần nhất 12s trước
✓ agent KHÔNG thấy token         (sudo -u bee-agent env | grep -i token → rỗng)
✓ agent KHÔNG push được          (git push --dry-run → fail đúng như mong đợi)
✓ sudoers chỉ cho phép 1 lệnh
✓ claude đã login dưới bee-agent
✗ cloudflared chưa cấu hình      → dashboard chỉ dùng được ở localhost
✓ 2/3 build slot, 0/1 evidence slot
✓ heartbeat 12s
```

Chạy `be doctor` sau mỗi lần đổi cấu hình, và đặt nó vào mốc M0 như điều kiện nghiệm thu.

### 16.3. Dùng chung máy — vừa chạy agent vừa làm việc

Được, và không cần máy chuyên dụng. Nhưng có bốn điểm va chạm thật, xếp theo mức nghiêm trọng.

#### 1 · Quyền đọc thư mục home

`bee-agent` là một user thật trên máy. Ubuntu tạo home với quyền cho phép user khác đọc trong nhiều cấu hình, nghĩa là agent có thể đọc `~/.ssh`, `~/.aws`, `~/.gitconfig` của bạn. Đóng lại, và kiểm chứ đừng đoán:

```bash
chmod 700 /home/$USER
sudo -u bee-agent ls /home/$USER    # phải: Permission denied
```

Nhớ rằng agent chạy `--dangerously-skip-permissions`, nên đây là ranh giới duy nhất giữa nó và tệp cá nhân của bạn.

#### 2 · E2E nhạy cảm với tải máy — và đây mới là chỗ khó chịu nhất

Bể build chủ yếu chờ model nên bạn dùng máy song song gần như không ảnh hưởng. **Bể evidence thì khác:** Playwright đo thời gian thật. Bạn compile một dự án lớn hoặc mở 40 tab trong lúc nó đang quay video thì test có thể timeout.

Tin tốt: **chế độ hỏng này khó chịu chứ không nguy hiểm.** Test đỏ → `publish-evidence.sh` từ chối publish → không bao giờ có bằng chứng giả. Cái giá là một lần chạy lại, và nếu xui hai lần liên tiếp thì task bị gắn `needs-human` oan.

Nếu sắp làm việc nặng, hạ bể evidence về 0 thay vì chịu đựng:

```bash
be pause              # dừng hẳn, dùng khi cần cả máy
# hoặc chỉnh MAX_EVIDENCE_SLOTS=0 trong bee.env — build vẫn chạy
```

#### 3 · Giữ chỗ tài nguyên bằng systemd slice

Cho toàn bộ agent vào một slice để nó không bao giờ bóp nghẹt phiên làm việc của bạn:

```ini
# /etc/systemd/system/bee.slice
[Slice]
MemoryHigh=20G          # bắt đầu ép khi vượt, không giết
MemoryMax=24G           # trần cứng — luôn chừa bạn 8G
CPUWeight=50            # phiên tương tác mặc định 100 ⇒ bạn luôn được ưu tiên
IOWeight=50
```

Rồi thêm `Slice=bee.slice` vào `bee-task@.service`. `MemoryHigh` ép trước khi `MemoryMax` giết, nên biểu hiện là agent chậm lại chứ không phải bị OOM kill giữa chừng.

#### 4 · Đụng cổng

Preview env **không được `ports:` ra host** — chỉ `expose` và tham gia mạng chung với Caddy. Nếu preview publish cổng 3000 thì lần bạn chạy `npm run dev` sẽ fail với lỗi khó hiểu. Thiết kế Caddy ở [AGENT_FLOW §7](AGENT_FLOW.md#7-preview-environment) vốn không cần publish cổng nào — chỉ cần đừng vô tình thêm vào.

#### Ba kiểu dùng

| Kiểu | Phù hợp | Lưu ý |
|---|---|---|
| **Headless, SSH khi cần** | Tốt nhất | Không va chạm gì |
| **Dùng nhẹ** — editor, SSH, duyệt web | Ổn | Làm đủ mục 1 + 3 là xong |
| **Máy dev chính** — compile nặng, chạy test riêng | Được, nhưng gợn | Đặt `MAX_EVIDENCE_SLOTS=0` lúc làm việc nặng |

### 16.4. Gỡ bỏ

`be uninstall` phải có, và phải chạy được. Nó dừng unit, gỡ systemd file, xoá user/thư mục — nhưng **giữ lại `/srv/bee/state` và log**. Không có đường lùi sạch thì bạn sẽ ngại thử nghiệm.
