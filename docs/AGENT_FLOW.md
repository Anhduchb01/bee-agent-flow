# Agent Flow — Kiến trúc & Phương án

Tài liệu thiết kế cho hệ thống agent tự động build. Đối tượng: PM, Techlead, và chính agent.

**Bối cảnh:** đội 3 người (PM, Techlead, + agent). Repo **private**, mọi người có quyền write đều tin nhau. Agent chạy trên một **PC Ubuntu để ở nhà**, đã đăng nhập Claude Code bằng gói thuê bao. Domain quản lý trên **Cloudflare**. GitHub gói **Free**.

---

## 1. Nguyên tắc nền

**Agent không có trí nhớ. GitHub mới có.**

Mọi thứ agent cần để làm một task phải nằm trong issue body hoặc comment. Một quyết định chỉ tồn tại trong đầu Techlead, hoặc trong tin nhắn Zalo, là một quyết định agent sẽ làm sai. Đây là kỷ luật khó nhất của cả hệ thống — khó hơn mọi phần kỹ thuật bên dưới.

Hệ quả kiến trúc: tách làm ba lớp, mỗi lớp một nguồn sự thật riêng.

| Lớp | Giữ cái gì | Ở đâu |
|---|---|---|
| **State** | Task, trạng thái, thảo luận, quyết định | GitHub Issues + Projects + PR |
| **Runtime** | Nơi agent thực sự chạy: filesystem, DB, browser | PC Ubuntu ở nhà |
| **Evidence** | Chứng minh "nó chạy thật": video, screenshot, preview | MinIO + preview env |

```
┌─────────────────────────────────────────────────────────┐
│  GITHUB (state)                                         │
│  Issue ──label──► PR ──review──► merge                  │
└────────┬────────────────────────────────▲───────────────┘
         │ outbound poll                  │ push / comment
┌────────▼────────────────────────────────┴───────────────┐
│  PC UBUNTU (runtime)                                    │
│  runner ──► Claude Code ──► worktree ──► docker compose  │
└────────┬────────────────────────────────────────────────┘
         │ cloudflared (outbound tunnel)
┌────────▼────────────────────────────────────────────────┐
│  EVIDENCE                                               │
│  pr-42.domain.com (preview)  ·  MinIO (video/ảnh)       │
└─────────────────────────────────────────────────────────┘
```

Chú ý cả ba mũi tên ra khỏi PC đều là **outbound**. Không có port nào mở vào máy ở nhà. Đây là ràng buộc chi phối nhiều lựa chọn phía dưới.

---

## 2. Vòng đời một task

Trạng thái được biểu diễn bằng **label**, không phải bằng cột trên Projects.

```
[PM tạo issue]
   │
   ▼
status:draft ──(PM gắn)──► status:ready-for-spec
                                 │  agent chạy /spec
                                 ▼
                          status:spec-review ──► PM/TL duyệt spec trong comment
                                 │  gắn status:approved
                                 ▼
                          status:building      agent: /plan → /build → /test → draft PR
                                 │
                                 ▼
                          status:evidence      preview env + E2E + video → PR body
                                 │
                                 ▼
                          status:review        Techlead review
                                 │
                        ┌────────┴────────┐
                 changes-requested      approved
                        │                 │
                        ▼                 ▼
                  status:building      merge → issue tự đóng
```

**Vì sao là label, không phải Projects:** label bắn webhook/query ổn định (`gh issue list --label`), Projects v2 chỉ có GraphQL API rườm rà. Projects vẫn dùng — nhưng chỉ để **nhìn**, sync một chiều từ label sang board.

**Chốt chặn người bắt buộc:** giữa `spec-review` và `approved`. Đây là chỗ rẻ nhất để sửa sai. Agent build lệch 3 tiếng vì spec mơ hồ đắt hơn PM đọc spec 5 phút rất nhiều.

### Bộ label

| Nhóm | Label |
|---|---|
| Trạng thái | `status:draft` `status:ready-for-spec` `status:spec-review` `status:approved` `status:building` `status:evidence` `status:review` `status:blocked` |
| Điều khiển agent | `agent:eligible` (PM/TL gắn tay) · `agent:build` (kích hoạt) · `agent:running` · `agent:failed` |
| Cờ | `needs-human` · `preview:on` (bật preview env cho PR này) |

`agent:eligible` là cờ **opt-in**: mặc định agent không nhận issue nào. Người gắn nó là người chịu trách nhiệm rằng task này phù hợp để giao máy.

---

## 3. Issue = hợp đồng

Không có hợp đồng thì không chạy. `.github/ISSUE_TEMPLATE/task.yml` bắt buộc 5 mục:

| Mục | Vì sao bắt buộc |
|---|---|
| **Mục tiêu** (1 câu, góc nhìn người dùng) | Agent bám vào đây khi phải chọn giữa hai cách làm |
| **Acceptance Criteria** (Given/When/Then, dạng checkbox) | Trở thành test case và tên file E2E |
| **Ràng buộc kỹ thuật** | File/module được phép đụng, API contract |
| **Out of scope** | Quan trọng ngang AC — đây là thứ chặn agent nở scope |
| **UI Reference** | Link Figma / screenshot / mô tả |

**Spec Gatekeeper:** khi issue được gắn `ready-for-spec`, agent chấm độ rõ ràng trước. Thiếu AC, hoặc AC không kiểm chứng được → comment hỏi ngược PM và dừng, thay vì lao vào code. Dùng skill `interview-me` và `idea-refine` đã có sẵn.

---

## 4. Điều phối — ba phương án

Đây là quyết định kiến trúc lớn nhất còn để mở. Cả ba đều chạy trên cùng PC Ubuntu, khác nhau ở **cách công việc đi từ GitHub xuống máy**.

### Phương án A — GitHub Actions self-hosted runner

Cài GitHub runner agent lên PC. Nó **poll ra ngoài** bằng long-polling HTTPS. Workflow YAML định nghĩa các bước.

```yaml
on: { issues: { types: [labeled] } }
jobs:
  build:
    if: github.event.label.name == 'agent:build' && vars.AGENT_ENABLED == 'true'
    runs-on: [self-hosted, bee]
    steps:
      - uses: actions/checkout@v4
        with: { persist-credentials: false }     # ← dòng quan trọng nhất
      - name: Lấy issue          # CÓ token
      - name: Agent làm việc     # KHÔNG có token
      - name: Push + tạo PR      # CÓ token, agent không can thiệp được
```

### Phương án B — Webhook daemon

Tự viết một HTTP service trên PC, GitHub gọi vào khi có event.

### Phương án C — Polling reconciler

Systemd timer trên PC, mỗi 30 giây đối chiếu trạng thái thay vì nghe event:

```bash
gh issue list --label agent:build --state open --json number \
  | jq -r '.[].number' | while read n; do process_issue "$n"; done
```

Không có "event" nào cả — hàng đợi **chính là cái label**, nằm trên GitHub. Đây là kiểu reconcile của Kubernetes.

### So sánh

| Tiêu chí | A · Actions runner | B · Webhook | C · Reconciler |
|---|---|---|---|
| Cần mở port inbound | Không | **Có** (bắt buộc tunnel ngay từ đầu) | Không |
| PC offline lúc trigger | Job xếp hàng trên GitHub | **Mất event vĩnh viễn** | Nhặt lại khi bật |
| Idempotent | Có (re-run) | Không | **Có, tự nhiên** |
| Log UI, lịch sử, nút re-run | Có sẵn | Tự xây | Tự xây |
| Quản lý secret | Có sẵn, mã hoá | Tự làm (.env trên máy) | Tự làm (.env trên máy) |
| Timeout / cancel / audit | Có sẵn | Tự làm | Tự làm |
| Xếp hàng & giới hạn WIP | Miễn phí (1 runner = 1 job) | Tự làm | Tự làm |
| Giữ session xuyên nhiều lần chạy (`--resume`) | Vướng | Dễ | Dễ |
| Hàng đợi có ưu tiên | Không | Dễ | Dễ |
| Phụ thuộc GitHub | Chặt | Chặt | Lỏng (đổi tracker dễ) |
| Công viết ban đầu | ~0 | 2–3 ngày | 1–2 ngày |
| Guardrail tách token | Ranh giới step ép sẵn | Tự kỷ luật | Tự kỷ luật |

### Đánh giá

**B bị loại.** Nó gánh mọi nhược điểm của việc tự làm, cộng thêm hai thứ riêng mà A và C đều không có: bắt buộc inbound, và mất event khi máy không sẵn sàng. Với một PC ở nhà — reboot, mất mạng chớp nhoáng, cloudflared restart — mất event không phải rủi ro lý thuyết, nó sẽ xảy ra. Và nó xảy ra **im lặng**: PM gắn label, chờ 20 phút, không có gì, không log nào giải thích.

**A vs C là đánh đổi thật.** A cho không toàn bộ tầng vận hành (log streaming, lịch sử, re-run, secret, timeout, xếp hàng) — đây là thứ Techlead mở ra mỗi lần agent làm sai, và tự xây lại tốn vài ngày cho ra sản phẩm tệ hơn. C cho toàn quyền kiểm soát tiến trình và hợp triết lý "state nằm ở git" hơn.

### ✅ Đã chốt: phương án C

Thiết kế chi tiết ở **[AGENT_RECONCILER.md](AGENT_RECONCILER.md)**.

Lý do chọn C thay vì A dù A tốn ít công hơn:

- **Hàng đợi có ưu tiên** — việc gỡ chặn người (review comment đang chờ) vượt trước việc mới. Actions coi mọi event bình đẳng.
- **`--resume` xuyên nhiều lần chạy** — agent nhớ lý do nó đã quyết định như vậy ở vòng review, thay vì đọc lại diff từ đầu.
- **Không mất việc khi máy tắt** — hàng đợi chính là label trên GitHub, không có gì để mất.
- **CI chạy trên phần cứng của mình** — Postgres/Redis thật, nhanh hơn hosted runner, và reconciler phục vụ luôn PR do người mở.
- **Không khoá vào GitHub** — đổi tracker chỉ sửa lớp query.

Cái giá: **thêm ~1,5–2 ngày** để tự dựng những thứ Actions cho không (log, secret, timeout, chống trùng), và ba chế độ hỏng riêng — nguy hiểm nhất là *reconciler chết im lặng*. Đối chiếu đầy đủ ở [AGENT_RECONCILER.md §9](AGENT_RECONCILER.md#9-đối-chiếu-mất-gì-được-gì) và §13.

> Bộ script thân (`collect-issue-context.sh`, `run-agent.sh`, `publish-evidence.sh`) độc lập với lớp trigger. Nếu sau này muốn quay lại A, chỉ cần bọc chúng bằng workflow YAML.

---

## 5. Máy chạy

**PC Ubuntu ở nhà.** So với VPS: nhiều RAM hơn, không tốn tiền thuê, và runner sau NAT không cần mở port. Đổi lại phải tự lo điện, mạng, và chuyện máy ngủ.

### Cách ly

Tạo user `runner` riêng, **không sudo**, chỉ thuộc group `docker`. Agent chạy dưới user này.

**Vì sao vẫn cách ly dù mọi người đều tin nhau:** người tin được, nhưng *đầu vào* thì không. Issue body có thể chứa nội dung copy từ khách hàng. Agent đọc trang web, cài package npm, chạy code sinh ra từ mô tả của người khác. Prompt injection không cần một đồng nghiệp xấu tính — chỉ cần một trang web. Ranh giới user là lớp phòng thủ rẻ nhất còn lại.

Điều "mọi người tin nhau" thực sự thay đổi: bỏ được lo ngại về việc ai đó sửa workflow YAML để chạy lệnh tuỳ ý trên máy bạn, và làm `--dangerously-skip-permissions` trở nên chấp nhận được (xem §6).

### Xác thực Claude Code

Đăng nhập **dưới user `runner`**:

```bash
sudo -u runner -H bash -lc 'claude'   # gõ /login
```

Credential nằm ở `/home/runner/.claude`, runner service chạy cùng user → dùng lại được. **Không cần secret `CLAUDE_CODE_OAUTH_TOKEN`**, không cần lo gia hạn token.

Hai hệ quả của việc dùng gói thuê bao:
- **Quota dùng chung với tài khoản cá nhân.** Agent chạy 5 task buổi sáng có thể làm bạn hết lượt buổi chiều. Nếu vướng, tách tài khoản riêng cho bot.
- **`total_cost_usd` mất ý nghĩa.** Theo dõi bằng **số turn và thời lượng** thay vì tiền.

### Yêu cầu vận hành

- Tắt sleep/hibernate: `sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target`
- Laptop: `HandleLidSwitch=ignore` trong `/etc/systemd/logind.conf`
- BIOS: tự khởi động lại sau mất điện
- RAM: 16GB trở lên (lý do ở §7)

> **Runner tự clone repo vào `~/actions-runner/_work`.** Clone repo bạn đang dùng trên PC không liên quan — và đừng trỏ runner vào đó, `actions/checkout` sẽ reset sạch, code chưa commit sẽ mất.

---

## 6. Guardrails

GitHub Free + private repo **không có** protected branches, required reviewers, required status checks, CODEOWNERS, environments. Những guardrail đó phải dựng ở chỗ khác.

### Ba tầng chặn agent

**Tầng 1 — Agent không cầm credential.**
`actions/checkout` với `persist-credentials: false`, và step chạy agent không nhận `GH_TOKEN`. Step push/tạo PR nằm trong YAML, agent không sửa được lúc đang chạy.

> Nếu quên `persist-credentials: false`, credential nằm sẵn trong `.git/config` và agent chỉ cần `git push origin main` là toàn bộ thiết kế này sụp — mà bạn không hề hay biết.

**Tầng 2 — Token thiếu quyền `Workflows`.**
`BOT_TOKEN` dùng fine-grained PAT, chỉ cấp `Contents: write` + `Pull requests: write`, **cố ý không cấp `Workflows`**. GitHub sẽ từ chối mọi push có sửa file trong `.github/workflows/`. Agent không thể tự nới guardrail của chính nó.

**Tầng 3 — Cảnh báo push thẳng vào main.**
Workflow `on: push` nhánh `main`: nếu commit không phải merge commit thì mở issue báo động. Không ngăn được, nhưng biết trong 30 giây thay vì ba ngày.

Cộng lại, đây là thứ gần nhất với protected branch mà gói Free cho phép. Khi có người thứ 4, nâng **GitHub Team** (~$4/user/tháng) để lấy protected branch thật — vẫn giữ cả ba tầng trên vì chúng chặn ở tầng khác.

### Giới hạn tài nguyên

| Chốt | Giá trị | Ghi chú |
|---|---|---|
| `timeout-minutes` (Actions) | 45 | Chốt ngoài cùng |
| `timeout` (bash) | 30m | Chốt trong |
| `--max-turns` | 80 | **Giới hạn thật duy nhất** |
| Retry | tối đa 2 lần → `needs-human` | Không lặp vô hạn |
| WIP | 1 runner = 1 job | Tăng khi nào tắc |

Nói thật: **không có cách chặn cứng theo đô-la.** CLI chỉ báo chi phí *sau khi* chạy xong. `--max-turns` mới là giới hạn thi hành được.

### Kill switch

Repo variable `AGENT_ENABLED`. Đổi thành `false` → mọi job thoát ngay ở điều kiện `if`. Miễn phí, không cần deploy gì.

### `--dangerously-skip-permissions`

Trong CI không tương tác, `--permission-mode acceptEdits` sẽ **chặn mọi lệnh Bash** (không ai bấm Yes) → agent tê liệt. Hai lựa chọn:

- `--allowedTools` liệt kê trắng — an toàn hơn, nhưng mất nhiều ngày dò xem còn thiếu tool gì
- `--dangerously-skip-permissions` — bù bằng: user không sudo, không có GitHub token, workspace bị reset mỗi lần, repo private, người tin nhau

**Chọn cách 2.** Các lớp bù đã đủ với bối cảnh này. Siết lại bằng `--allowedTools` sau khi log đủ để biết agent thực sự dùng những gì.

### Chỉ dẫn không phải là cưỡng chế

Câu hỏi hợp lý: đã ghi rõ trong `AGENTS.md` và skill là "không được push vào `main`" rồi, có cần tách hai user nữa không?

**Cần — vì hai thứ đó nằm ở hai tầng khác nhau và hỏng theo hai kiểu khác nhau.**

| | Rule trong `AGENTS.md` / skill | Ranh giới hai user |
|---|---|---|
| Bản chất | Chỉ dẫn ở tầng prompt | Cưỡng chế ở tầng kernel |
| Hiệu lực | Xác suất — đúng *phần lớn* thời gian | Tuyệt đối — kể cả tình huống chưa ai nghĩ tới |
| Khi hỏng | **Im lặng**, phát hiện sau nhiều ngày | Không hỏng được |
| Ngăn được | Agent *thử* làm | Agent *làm được* |

Bốn cách một chỉ dẫn prompt bị vượt qua, không cách nào cần tới người xấu:

1. **Prompt injection.** Agent đọc issue body, comment PR, README của npm package, thông báo lỗi từ tool. Người thì tin được, **đầu vào thì không** — một bug report copy từ khách hàng cũng đủ.
2. **Trôi ngữ cảnh.** Sau 60 turn, `AGENTS.md` nằm rất xa trong context và mức tuân thủ giảm dần.
3. **Vi phạm có thiện chí.** Agent thật lòng tin rằng push thẳng là cách sửa đúng ("nhánh đang hỏng, tôi sửa nhanh trên `main`"). Đây không phải ác ý mà là phán đoán.
4. **`--dangerously-skip-permissions`.** Bạn đã trao toàn quyền tool. Prompt là thứ *duy nhất* còn đứng giữa agent và mọi câu lệnh.

Cái giá của việc tách user là **khoảng một giờ, làm một lần**. Cái nó ngăn là "agent viết lại lịch sử `main` lúc 2 giờ sáng". Đánh đổi lệch hẳn về một phía.

> **Vẫn giữ cả hai.** Rule trong `AGENTS.md` khiến agent không *thử* — đỡ tốn turn, log sạch hơn, ý định rõ ràng hơn. Ranh giới user khiến agent không *làm được*. Chúng bổ sung nhau chứ không thay thế nhau.

### Quy tắc bất di bất dịch

- Agent **không được merge**. Merge luôn là hành động của con người.
- Agent **không được** `--no-verify`, không sửa test cho pass.
- Agent **không được** sửa file test đã tồn tại trong cùng PR với code fix. Muốn sửa test → PR riêng.
- Secret thật nằm trên máy, agent chỉ thấy `.env.example`.
- **Repo phải luôn private.** Public + self-hosted runner = PR của người lạ chạy code lạ trên máy nhà bạn.

---

## 7. Preview environment

> **Opt-in bằng label `preview:on`, và là hạng mục làm sau cùng.** Xem §7.0.

### 7.0. Bằng chứng ≠ preview

Hai thứ này hay bị gộp làm một, nhưng tách ra thì lợi rất nhiều:

| | Bằng chứng (video, ảnh) | Preview env (URL sống) |
|---|---|---|
| Cần gì | Stack chạy **localhost** trên PC | Expose ra internet |
| Hạ tầng | Không cần gì thêm | Caddy + cloudflared + Cloudflare Access + domain |
| RAM | Dựng rồi tắt ngay sau khi test | Sống suốt vòng đời PR (~1,5GB) |
| PM dùng để | Duyệt AC — xem video là đủ cho phần lớn task | Tự bấm thử, khám phá ngoài kịch bản |
| Khi nào làm | **Sớm** (M3) | **Sau cùng** (M6) |

Phần lớn task PM chỉ cần xem video là duyệt được. Preview env chỉ thực sự cần khi task có tương tác phức tạp, hoặc PM muốn tự mò ngoài kịch bản đã quay.

Vì vậy: **preview bật bằng label `preview:on`**, PM/TL gắn tay khi thấy cần. Mặc định tắt. Điều này vừa tiết kiệm RAM (trần 3 preview trở nên thừa thãi), vừa cho phép dời toàn bộ hạ tầng tunnel sang mốc cuối mà không chặn vòng lặp chính.

### 7.1. Định tuyến

Mỗi PR có `preview:on` được cấp một URL sống để PM bấm vào dùng thử.

### Định tuyến

Một **Caddyfile tĩnh** phục vụ mọi PR, không cần reload khi mở PR mới:

```caddyfile
*.yourdomain.com {
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy {labels.2}-backend:8000
    }
    handle {
        reverse_proxy {labels.2}-frontend:3000
    }
}
```

`{labels.2}` là subdomain (labels đếm ngược từ TLD), nên `pr-42.yourdomain.com` tự route sang container `pr-42-frontend`. Gộp backend vào `/api/*` trên cùng hostname → mỗi PR chỉ một URL, `NEXT_PUBLIC_API_URL` trỏ `/api`.

### Vì sao là `pr-42.yourdomain.com` chứ không phải `pr-42.dev.yourdomain.com`

**Universal SSL miễn phí chỉ phủ domain gốc + subdomain một cấp.** Hai cấp (`pr-42.dev.…`) không có cert, browser báo lỗi SSL, muốn phủ phải mua Advanced Certificate Manager (~$10/tháng). Bỏ chữ `dev` là né được, không mất gì.

### Đưa ra internet: Cloudflare Tunnel

PC ở sau NAT. **Không port-forward** — mở port 80 từ router nhà ra internet để chạy máy có Claude Code toàn quyền là đánh đổi tệ.

`cloudflared` mở kết nối **ra ngoài**, giải quyết cùng lúc bốn việc:

| Việc | Cách giải |
|---|---|
| Inbound qua NAT | Tunnel outbound, không mở port nào |
| Wildcard DNS | CNAME `*` → `<UUID>.cfargotunnel.com`, bật proxy. Dùng được trên gói Free |
| HTTPS | Universal SSL, miễn phí |
| Chặn người lạ | **Cloudflare Access** — whitelist 3 email, miễn phí tới 50 user |

Cloudflare Access không phải tuỳ chọn. Không có nó, preview env của bạn công khai trên internet và sẽ bị index.

### Giới hạn tài nguyên

Mỗi preview là một stack đầy đủ (web + API + DB + cache) ≈ **1,5GB RAM**. Ba preview song song ≈ 5GB, chưa tính runner đang build.

- Trần **3 preview** cùng lúc, `preview.sh` từ chối cái thứ 4
- Teardown tự động khi PR đóng (`docker compose down -v` — có `-v` để xoá volume Postgres)
- Cron dọn preview mồ côi hằng đêm

Đây là điểm dễ vỡ nhất: hết RAM biểu hiện thành preview timeout ngẫu nhiên và build chậm bất thường, rất dễ tưởng nhầm là agent hỏng.

---

## 8. Bằng chứng

Đã có skill [`e2e-evidence-capture`](../.claude/skills/e2e-evidence-capture/SKILL.md). Tóm tắt hợp đồng:

**Luật lõi: bằng chứng chỉ được lấy từ lần chạy mà mọi test đều xanh.** Không ghép video từ nhiều lần chạy. Đỏ thì sửa code rồi quay lại từ đầu.

Vòng lặp: viết spec theo AC → chạy có bật quay → đỏ thì đọc trace/video, sửa **code** (không nới assertion) → xanh → `--repeat-each=3` để loại flake → publish.

`publish-evidence.sh` **từ chối publish nếu run không xanh, và cố ý không có cờ `--force`.** Đây là chỗ agent sẽ tìm cách lách nhiều nhất.

Xuất ra: mp4 (bản đầy đủ) + gif (preview inline — GitHub *không* render player cho video host ngoài, link mp4 trần là reviewer phải tải về). Upload vào bucket MinIO **riêng** (`mc anonymous set download` mở public cả bucket, đừng trỏ vào bucket asset của app), path scoped theo run để re-run không đè bằng chứng cũ, lifecycle 90 ngày.

Khối bằng chứng trong PR body luôn **thay thế**, không nối thêm, và ghi rõ commit SHA — bằng chứng của commit không còn là HEAD là bằng chứng hết hạn.

---

## 9. Duyệt & vòng feedback

### 9.0. Hai người duyệt, hai việc khác nhau

Một PR cần **cả PM và Techlead** duyệt, nhưng họ duyệt hai thứ khác nhau:

| | Techlead duyệt | PM duyệt |
|---|---|---|
| Nhìn vào | Diff, kiến trúc, test, bảo mật | Khối bằng chứng, checkbox AC, video |
| Câu hỏi | "Code này có đúng và bền không?" | "Nó có làm đúng thứ tôi yêu cầu không?" |
| Không cần | Xem video | Đọc diff |

GitHub Free **không** enforce được required reviewers trên private repo. Nhưng bản thân việc review và bấm Approve thì miễn phí — thứ thiếu chỉ là cưỡng chế. Reconciler bù vào chỗ đó:

```bash
# đủ approve từ cả hai nhóm → status xanh
gh api "repos/$REPO/statuses/$SHA" -f state=success -f context="bee/approvals"
```

Cấu hình trong `/etc/bee/config.env`:

```bash
REVIEWERS_PM="pm-github-username"
REVIEWERS_TL="techlead-github-username"
```

Mỗi tick, với mỗi PR mở, reconciler đếm approve và đẩy commit status `bee/approvals`: đỏ khi còn thiếu, xanh khi đủ cả hai phía. PR hiện dấu tích y như có branch protection.

Nó **không chặn** được nút Merge (cần gói Team mới chặn thật), nhưng nó biến "quên xin PM duyệt" từ chuyện vô hình thành một dấu X đỏ ai cũng thấy. Với 3 người tin nhau, tín hiệu là đủ.

> **Thứ tự tự nhiên:** agent mở draft PR → CI xanh → bằng chứng gắn vào → chuyển sang ready-for-review → TL soi code, PM soi video → cả hai approve → status xanh → người bấm merge.

### 9.1. Techlead → agent

Comment trên diff line của PR kèm `@claude`. GitHub gửi kèm `path` + `line` + `diff_hunk` trong payload → agent có context chính xác, không phải đoán.

Quy ước: **chỉ resolve thread khi agent đã fix và Techlead đã xác nhận.** Thread chưa resolve = chưa xong.

### 9.2. PM → agent (comment trên UI)

Đây là chỗ mất thời gian nhất nếu làm sai: PM viết "nút này lệch", agent phải đoán nút nào, file nào.

**Giải pháp:** nhúng feedback widget vào preview build. PM Alt+Click vào phần tử, widget bắt:

- **`file:line` của React component** — mảnh ghép quyết định. React dev build có `__source` (fileName/lineNumber) qua `@babel/plugin-transform-react-jsx-source`; `react-dev-inspector` / `click-to-component` đọc được từ DOM element
- CSS selector + computed styles
- Screenshot vùng đó + full page
- Viewport, URL, console error, network fail gần nhất
- Text PM gõ

Widget POST lên GitHub API tạo comment máy đọc được:

```markdown
<!-- ui-feedback -->
**Element:** `frontend/src/features/auth/LoginForm.tsx:47` (`button.submit-btn`)
**Viewport:** 390×844 (mobile)
**Nhận xét:** nút bị tràn khỏi container khi text dài
![](https://minio.../fb-9f2.png)
```

Agent thấy marker `<!-- ui-feedback -->` → biết ngay file nào, dòng nào.

**Cân nhắc mua thay vì xây:** Marker.io (screenshot + console log + session replay → GitHub issue) hoặc Vercel Preview Comments. Chúng đủ dùng cho phần lớn nhu cầu và tiết kiệm 1–2 tuần. Nhưng chúng **không có `file:line`** — đó là lý do chính đáng duy nhất để tự xây.

Đây là hạng mục có giá trị cao nhưng nên làm **sau cùng**, khi vòng lặp cơ bản đã chạy ổn.

---

## 10. Trí nhớ của agent

Câu hỏi "có nên dùng Letta / MemGPT / codebase-memory không" chỉ trả lời được sau khi tách ra **bốn loại trí nhớ khác nhau** — chúng hay bị gộp làm một, và mỗi loại có lời giải riêng.

| Loại | Ví dụ | Lời giải | Trạng thái |
|---|---|---|---|
| **Trong một task** | đang sửa file nào, vừa thử gì | Context window của agent | Có sẵn |
| **Xuyên vòng review của cùng PR** | "tôi chọn cách này vì AC-3 yêu cầu…" | `--resume <session_id>` | Đã thiết kế (§5 Reconciler) |
| **Quy ước & bài học của dự án** | layering, đã thử X và fail, đừng dùng lib Y | `AGENTS.md` + ADR + `LEARNINGS.md` | Có sẵn, cần bổ sung |
| **Cấu trúc codebase** | auth nằm ở đâu, ai gọi hàm này, đổi cái này thì vỡ gì | **GitNexus** (đồ thị tri thức code) | Đã có MCP, cần cắm vào |

### Vì sao chưa dùng Letta / MemGPT

Bốn lý do, xếp theo mức độ nghiêm trọng:

**1. Memory poisoning không quan sát được.** Một ghi nhớ sai — "API trả về snake_case" trong khi dự án đã đổi sang camelCase từ ba tháng trước — sẽ tồn tại vĩnh viễn và bẻ lệch **mọi task sau đó**, mà không ai review, không ai thấy. Với memory dạng file trong git, sai một dòng thì `git blame` ra ngay và revert trong 5 giây.

**2. Nó tạo ra nguồn sự thật thứ hai**, mâu thuẫn trực tiếp với nguyên tắc ở §1. Khi vector store và `AGENTS.md` nói khác nhau, không có cơ chế nào phân xử.

**3. Thêm một dependency phải sống 24/7.** Nó chết thì agent không báo lỗi — nó chỉ **ngu đi âm thầm**. Đây đúng là chế độ hỏng mà §13 của tài liệu reconciler cảnh báo.

**4. Giá trị cốt lõi của Letta là dành cho agent hội thoại dài hạn *không có* kho lưu trữ bên ngoài.** Ở đây kho lưu trữ bên ngoài chính là repo — thứ vốn đã được version, review, và diff.

### Cách làm thay thế: cho memory đi qua đúng cổng review như code

Agent được phép **đề xuất** ghi nhớ, nhưng không được tự ghi:

```
Agent phát hiện điều đáng nhớ
   └─► mở PR sửa .claude/LEARNINGS.md
          └─► người duyệt (đúng cổng như mọi PR khác)
                 └─► merge → thành canon, mọi task sau đọc được
```

Được khoảng 80% giá trị của Letta, 0% rủi ro trôi dạt, và mỗi ghi nhớ đều **diff được, revert được, blame được**. Quan trọng hơn: PM và Techlead nhìn thấy agent đang "học" cái gì — thay vì một hộp đen ngày càng tự tin về những điều không ai kiểm chứng.

Giữ `LEARNINGS.md` ngắn. Nó không phải nhật ký — nhật ký nằm ở `docs/agent-log/`. Chỉ những bài học đủ khái quát để áp dụng cho task sau mới được vào.

### GitNexus thì khác — dùng ngay

GitNexus là **trí nhớ dẫn xuất**: nó sinh lại được hoàn toàn từ code. Không drift, không thể poisoning, sai thì index lại. Nó giải đúng bài toán tốn kém nhất của agent trong repo lớn: *tìm đúng chỗ để sửa*, và *biết trước cái gì sẽ vỡ*.

Cắm vào bằng `.mcp.json` ở gốc repo, agent tự dùng khi cần. Index lại sau mỗi lần merge vào `main` — thêm một rule cho reconciler.

### Khi nào cân nhắc lại

Dấu hiệu cụ thể, không phải theo cảm tính:

- `LEARNINGS.md` + `AGENTS.md` vượt quá phần context hợp lý (khoảng > 2.000 dòng)
- Trên 100 task/tháng, và bắt đầu thấy agent lặp lại đúng một lỗi đã sửa
- Cần trí nhớ **theo từng người** ("PM này luôn muốn thêm empty state") — đây là thứ file dùng chung khó biểu diễn

Ở quy mô 3 người, vài task/ngày, cả ba dấu hiệu đều còn rất xa.

---

## 11. Ranh giới: giao gì cho agent

| Hợp | Không hợp |
|---|---|
| CRUD, form có validate | Thiết kế kiến trúc mới |
| Refactor có test bao phủ | Tối ưu performance |
| Sửa bug đã tái hiện được | Quyết định đánh đổi sản phẩm |
| Viết test cho code sẵn có | Task mà AC không viết ra được |
| Đổi UI theo mô tả rõ ràng | Bất cứ thứ gì chạm tới auth/billing lần đầu |

Cơ chế thi hành: label `agent:eligible` gắn tay. Mặc định agent **không** nhận issue nào.

---

## 12. Vận hành

**Giới hạn WIP.** Agent mở 8 PR/ngày, Techlead review được 3 → hàng đợi PR conflict lẫn nhau. Trần **2–3 PR mở cùng lúc**, đặt từ đầu chứ không phải khi đã tắc. Một runner cho sẵn giới hạn này miễn phí.

**Log từng task.** `docs/agent-log/<issue>.md`: agent hiểu sai chỗ nào, phải sửa tay bao nhiêu, bao nhiêu turn, bao lâu. Sau ~20 task bạn sẽ biết ranh giới thật của nó và sửa `AGENTS.md` cho đúng, thay vì đoán.

**Dọn dẹp định kỳ:** volume Postgres của preview (đầy đĩa sau ~2 tuần nếu quên `-v`), artifact MinIO (lifecycle 90 ngày), worktree mồ côi, docker image cũ.

---

## 13. Rủi ro

| Rủi ro | Dấu hiệu sớm | Xử lý |
|---|---|---|
| Agent sửa test cho pass | Assertion bị nới cùng commit với fix | Skill đã cấm; review diff test riêng |
| Hết RAM khi có 3 preview | Preview timeout ngẫu nhiên, build chậm bất thường | Trần 3 preview, 16GB, teardown tự động |
| Volume preview không được dọn | Đĩa đầy sau ~2 tuần | `down -v` + cron prune |
| Quota Claude cạn giữa ngày | Agent báo rate limit | Tách tài khoản riêng cho bot |
| PC ngủ lén | Job treo, lỗi khó hiểu ở Actions | Mask sleep target, kiểm tra sau đêm đầu |
| Review thành nút cổ chai | PR mở chồng lên nhau, conflict | Trần WIP 2–3 |
| Task mơ hồ đốt turn | 1 task chạm `--max-turns` | Siết issue template, tách nhỏ task |
| Quên `persist-credentials: false` | *Không có dấu hiệu* — đây là điều nguy hiểm | Kiểm tra trong review workflow, đưa vào checklist |

---

## 14. Phụ lục — các quyết định đã chốt

| Quyết định | Chọn | Lý do | Loại bỏ |
|---|---|---|---|
| Máy chạy | PC Ubuntu ở nhà | Sẵn có, nhiều RAM, runner không cần inbound | VPS (tốn tiền, ít RAM hơn) |
| Xác thực Claude | Gói thuê bao, login dưới user `runner` | Không cần secret, không phải gia hạn token | API key (đo chi phí tốt hơn nhưng trả theo token) |
| Gói GitHub | Free + tách token 3 tầng | Miễn phí; tách token chặn ở tầng khác, có phần mạnh hơn branch protection | Team (~$12/tháng) — nâng khi có người thứ 4 |
| Đưa preview ra ngoài | Cloudflare Tunnel + Access | Không mở port, HTTPS miễn phí, chặn người lạ | Port-forward (rủi ro), Tailscale (cần cài client) |
| URL preview | `pr-42.yourdomain.com` (một cấp) | Universal SSL miễn phí chỉ phủ một cấp | `pr-42.dev.…` (cần ACM $10/tháng) |
| Điều phối | **Polling reconciler** ([chi tiết](AGENT_RECONCILER.md)) | Hàng đợi ưu tiên, `--resume`, không mất việc, không khoá GitHub | Actions runner (ít công hơn nhưng không có 4 điểm trên) · Webhook (mất event + cần inbound) |
| Permission mode | `--dangerously-skip-permissions` | `acceptEdits` làm agent tê liệt trong CI; đã có lớp bù | `--allowedTools` (siết lại sau khi có log) |
| Preview env | Opt-in bằng label `preview:on`, làm ở mốc cuối | Phần lớn task PM duyệt bằng video là đủ; tách được toàn bộ hạ tầng tunnel ra khỏi vòng lặp chính | Preview cho mọi PR (tốn RAM, chặn tiến độ) |
| Duyệt PR | PM + TL, cưỡng chế mềm bằng commit status | Free không enforce được required reviewers; dấu X đỏ là đủ với 3 người tin nhau | Gói Team (nâng khi có người thứ 4) |
| Trí nhớ agent | File trong git (`AGENTS.md`, ADR, `LEARNINGS.md` qua PR) + GitNexus | Memory phải review được và revert được; GitNexus là memory dẫn xuất nên không drift | Letta/MemGPT — poisoning không quan sát được, tạo nguồn sự thật thứ hai |

---

## 15. Danh sách file cần tạo

Danh sách đầy đủ cho phương án C ở [AGENT_RECONCILER.md §11](AGENT_RECONCILER.md#11-danh-sách-file). Tóm tắt:

```
.github/                     # hợp đồng — KHÔNG có workflows/
├── ISSUE_TEMPLATE/task.yml
├── pull_request_template.md
├── labels.yml
└── agent/*.md               # prompt template

infra/
├── reconciler/              # systemd unit, sudoers, bootstrap
└── preview/                 # compose per-PR, Caddyfile, cloudflared, preview.sh

.claude/skills/e2e-evidence-capture/    # đã có sẵn
```

> `.github/workflows/` trống là hệ quả trực tiếp của việc chọn C.
