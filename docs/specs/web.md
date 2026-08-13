# SPEC — web

Đặc tả kỹ thuật cho app quản lý dự án của PM & Techlead.

**Đầu vào đã chốt:** [`docs/intent/pm-app.md`](../intent/pm-app.md) (ý định,
đã xác nhận) · [`AGENTS.md`](../../AGENTS.md) (quy ước code, ranh giới)
**Trạng thái:** bản nháp đầu, chờ duyệt. Chưa viết dòng code nào.

---

## 1. Mục tiêu

Hai người — PM và Techlead — mở app này thay vì mở GitHub Issues. Họ biến ý tưởng
thành task, theo dõi agent, nói tiếp với agent về một task, xem bằng chứng, và
duyệt.

**Đo bằng hai câu, cả hai đều kiểm được:**

1. Trong một tuần làm việc bình thường, không ai mở tab GitHub Issues.
2. Từ lúc agent làm xong tới lúc người biết: **dưới 2 phút** (một tin Slack),
   thay vì "tới sáng hôm sau".

Câu thứ hai là lý do sản phẩm này tồn tại. Máy chạy 24/7, người nghẽn ở ba cửa —
duyệt spec, cho phép nhận task, approve PR — và mỗi cửa hiện đang mất hàng giờ vì
không ai được báo.

---

## 2. Cắt mốc — chỗ duy nhất cần bạn quyết

Toàn bộ spec này mô tả sản phẩm đủ. Thứ tự làm thì chia ba mốc, và **ranh giới
V1/V2 là thứ tôi tự cắt, không phải bạn nói**:

| Mốc | Gồm | Đạt được gì |
|---|---|---|
| **V1** | Đăng nhập · hộp thư chờ bạn · trang dự án · trang task · **tạo task bằng form** · chat vào task · xem bằng chứng · duyệt · Slack | Đủ để **bỏ GitHub Issues**. Cả hai thước đo ở §1 đều đạt |
| **V2** | **Chat ý tưởng** (cửa sổ trống, chỉ đọc repo, ra issue soạn sẵn) | Ý mù mờ không phải tự nghĩ ra AC trước khi gõ |
| **V3** | Màn hình vận hành (slot, heartbeat, lịch sử) · sắp xếp/ẩn khối | Thay hẳn dashboard tĩnh hiện tại |

**Lý do cắt chat ý tưởng xuống V2 dù bạn nêu nó từ đầu:** rule 08 đã làm gần hết
việc đó rồi. PM điền form 5 mục → spec gatekeeper chấm và **comment hỏi ngược** →
PM trả lời bằng chat trên chính task đó. Vòng hội thoại vẫn có, chỉ là bắt đầu từ
một form thay vì một ô trống. Đổi lại V1 không cần phiên agent chạy trực tiếp
(streaming, vòng đời phiên, tranh quota) — phần đắt nhất của cả sản phẩm.

Nếu bạn thấy "phải gõ được vào ô trống ngay từ đầu" mới là điểm mấu chốt thì nói,
tôi đảo V2 lên V1 và chấp nhận V1 chậm hơn đáng kể.

---

## 3. Người dùng và việc của họ

| | PM | Techlead |
|---|---|---|
| Sống ở | AC và video | Diff |
| Trong app | Tạo task, duyệt, chat | Chat vào task, xem hàng đợi |
| Ngoài app | — | Review diff và **merge trên GitHub** |
| App đưa gì | Nút Approve | **Link PR** |

Cả hai đều đăng nhập bằng GitHub OAuth và mọi thao tác ghi đều mang tên họ.

---

## 4. Màn hình

### 4.1. "Việc của bạn" — trang chủ

**Bảng** phẳng, mọi dự án, **xếp theo thời gian đã chờ giảm dần**. Không phân
trang, không tab.

Mỗi cột lọc bằng đúng thứ nó hiển thị: loại việc · dự án · ô tìm tiêu đề (bỏ
dấu, nên gõ "tinh thue" tìm được "Tính thuế") · ngưỡng thời gian chờ · cờ ưu
tiên. Bảng rỗng vì lọc và bảng rỗng vì hết việc **nói hai câu khác nhau**.

Trên bảng là một dải bốn con số, chọn theo câu người dùng thật sự hỏi buổi
sáng: có gì đang cháy · phải duyệt bao nhiêu · còn bao nhiêu chờ tôi cho phép ·
thứ lâu nhất đã chờ bao lâu.

Một mục xuất hiện ở đây khi và chỉ khi nó **chặn ở người đang đăng nhập**:

| Loại | Điều kiện | Chặn ở ai | Hành động |
|---|---|---|---|
| Cần người | issue/PR có `needs-human` | cả hai | Mở task |
| Agent hỏi ngược | comment mới nhất của agent kết thúc bằng dấu hỏi | người cuối cùng đã nói chuyện, không thì tác giả issue | Trả lời |
| Duyệt PR | PR mở, không nháp, `bee/test` xanh, có bằng chứng khớp SHA head, người này chưa approve | cả hai | **Duyệt** (PM) · **Xem PR** (TL) |
| Duyệt spec | issue có `status:spec-review` | PM | Duyệt spec |
| Cho phép nhận task | issue có `agent:build`, **thiếu** `agent:eligible`, không có `agent:running` | cả hai | **Giao cho agent** |

**Một task chỉ sinh một mục**, theo đúng thứ tự trên: lý do chặn cụ thể nhất
thắng. Không có luật này thì một issue vừa có PR nháp, vừa chờ trả lời agent,
vừa mang `agent:build` sẽ xuất hiện ba lần trong một danh sách phẳng.

> **Sửa so với bản nháp đầu:** bản đầu viết `status:approved`. Nhãn đó **không
> tồn tại** trong `repo_sync_labels()`. Điều kiện thật của rule 07 là issue có
> **cả** `agent:build` lẫn `agent:eligible`, nên "chờ cho phép nhận task" chính
> là trạng thái có `agent:build` mà thiếu `agent:eligible` — đúng như mô tả của
> nhãn đó: *"opt-in, người gắn"*. Luồng đầy đủ: `status:draft` → (người)
> `status:ready-for-spec` → (rule 08) `status:spec-review` → (người duyệt spec)
> `agent:build` → (người opt-in) `agent:eligible` → rule 07 dựng.

**`priority:high` hiện thành nhãn, không chen chỗ.** Nó là ưu tiên của hàng đợi
máy; thứ tự ở đây trả lời một câu khác — "ai đã chờ tôi lâu nhất".

**Rỗng là trạng thái tốt và phải trông như vậy** — không để một danh sách rỗng
trông giống lỗi tải.

### 4.2. Trang dự án `/p/[slug]`

Một dự án = một repo. Gồm: dải bốn con số, **danh sách task với hai kiểu xem**,
và hàng đợi của máy kèm `wait_reason`.

**Bảng** liệt kê mọi task mở kèm cột giai đoạn. **Kanban** xếp chúng vào sáu cột
theo đúng chiều công việc chảy — Nháp → Chờ chấm spec → Chờ giao cho agent →
Agent đang làm → Chờ duyệt PR → Cần người. Giai đoạn **suy ra từ nhãn thật**,
không phải từ một trường trạng thái riêng: nhãn là một tập hợp, một issue có thể
mang `agent:build` lẫn `needs-human` cùng lúc, nên phải chọn theo thứ tự "cụ thể
nhất thắng". Bảng **luôn đủ sáu cột**, kể cả cột rỗng — mất cột khi rỗng thì mỗi
lần mở lại có hình dạng khác và người dùng không học được vị trí của thứ gì.

Kiểu xem nằm trong URL (`?view=kanban`) nên chia sẻ được và server dựng sẵn đúng
kiểu.

**Thêm dự án** bằng modal ở danh sách dự án. App chỉ ghi nhận dự án ở phía nó —
nó không có sudo, không giữ token orchestrator, và không chạy `be repo add`.
Modal nói trước rằng còn một bước trên máy Ubuntu; tới lúc đó thẻ dự án mang
nhãn "reconciler chưa biết dự án này".

### 4.3. Trang task `/t/[slug]/[num]`

Một trang cho cả issue lẫn PR liên kết — vì với người dùng đó là *một việc*.

- Nội dung issue theo hợp đồng 5 mục, AC dạng checkbox
- Dòng thời gian: comment của người và của agent, xen kẽ theo thứ tự thật
- **Ô chat** ở cuối (§5)
- Khối bằng chứng: video/ảnh phát ngay trong trang (§6)
- Trạng thái: label hiện tại, `bee/test`, `bee/approvals`, link PR
- Nút theo trạng thái: Giao cho agent · Duyệt · Mở PR trên GitHub

### 4.4. Tạo task

**Modal, mở từ chi tiết dự án** — không có màn hình riêng. Dự án đã được chọn
bởi việc bạn đang đứng ở đó, nên một trang riêng chỉ thêm một lần điều hướng và
một ô chọn lặp lại thứ người dùng vừa nói.

Form theo đúng hợp đồng của
[`.github/ISSUE_TEMPLATE/task.yml`](../../.github/ISSUE_TEMPLATE/task.yml) — 5 mục
bắt buộc. Submit → tạo GitHub issue bằng token của người tạo, gắn
`status:ready-for-spec`. Tick sau rule 08 chấm và comment.

**App không được bỏ qua mục bắt buộc nào.** Hợp đồng thiếu là gốc của mọi task
build lệch, và làm form dễ hơn form GitHub là mục tiêu — không phải làm nó lỏng hơn.

---

## 5. Chat vào task

Đây là thứ thay cho việc gõ `@claude` trên GitHub.

**Cơ chế:** ô chat post một **comment thường lên PR** bằng token người dùng, nội
dung có chèn `@claude`. Rule 02 nhặt ở tick sau, `--resume` đúng phiên cũ nhờ
`session_id` trong `claim.json`, sửa code, đẩy commit, rồi comment kết quả.

> App **không** gọi model, **không** chạy agent. Nó chỉ viết một comment. Toàn bộ
> phần khó đã nằm trong reconciler.

**Hệ quả cho UI, và phải nói thật với người dùng:** vòng lặp này tính bằng phút
chứ không phải giây — tối đa 30 giây tới tick sau, cộng thời gian agent chạy. Gửi
xong phải hiện trạng thái rõ ràng (`đã gửi · chờ tick tiếp theo` → `agent đang
làm · 4m12s`), không phải một spinner vô tận. Nói dối về độ trễ tệ hơn độ trễ.

**Giới hạn V1:** rule 02 hiện chỉ quét review comment trên diff
(`pulls/{n}/comments`), không quét comment thường. Cần mở rộng rule 02 sang
`issues/{n}/comments` — thay đổi nhỏ, nhưng **là thay đổi trong reconciler** và
phải review riêng.

---

## 6. Bằng chứng — phần cần sửa reconciler

Intent đã chốt: **bỏ MinIO, đọc thẳng trên đĩa**. Điều đó kéo theo hai thay đổi
bắt buộc trong [`rules/04-evidence.sh`](../../apps/reconciler/rules/04-evidence.sh),
và cả hai đều không tự có:

**1 · Bằng chứng phải sống lâu hơn worker.** Hiện `test-results/` được chuyển vào
`state/<id>/`, mà `claim_clear` xoá cả thư mục đó khi worker thoát. Chuyển sang
vị trí bền:

```
/srv/bee/evidence/<slug>/<num>/<sha>/
├── results.json
├── <ac-slug>.mp4          # ffmpeg từ webm, phát được trên trình duyệt
├── <ac-slug>.gif
└── shots/<ac-slug>-*.png
```

Path có `<sha>` nên chạy lại không đè bằng chứng cũ. Dọn theo tuổi (90 ngày) hoặc
khi PR đóng.

**2 · Mốc "đã có bằng chứng cho SHA này" phải rời khỏi PR body.** Hiện `rule_scan`
kiểm bằng cách grep SHA trong PR body — không ghi lên PR nữa thì mốc đó biến mất
và rule khớp lại vĩnh viễn. Thay bằng: **thư mục `evidence/<slug>/<num>/<sha>/`
có tồn tại không.**

> Đây là chỗ duy nhất trong spec đụng vào reconciler ngoài §5. Ràng buộc "không
> sửa một dòng" ở intent nói về **mô hình hàng đợi và state** — cái đó giữ nguyên
> tuyệt đối. Hai thay đổi này là hệ quả trực tiếp của việc bạn chọn bỏ MinIO, và
> tôi nêu ra để nó không lọt qua dưới dạng "tiện tay sửa".

**Phía app:** route handler đọc file dưới `/srv/bee/evidence/`, kiểm đường dẫn
không thoát ra ngoài gốc (`path.resolve` rồi so tiền tố), stream với
`Content-Type` đúng. Không có file nào ngoài thư mục đó được phục vụ.

---

## 7. Nguồn dữ liệu

| | `/srv/bee/` | GitHub API |
|---|---|---|
| Đọc gì | `public/status.json`, `state/recent.jsonl`, `evidence/**` | issue, label, PR, comment, review, status |
| Tin cậy | Cache dẫn xuất, reconciler ghi đè mỗi tick | **Nguồn sự thật** |
| Cách đọc | server-only, `lib/bee/` | token người dùng, `lib/github/` |

**`status.json` cũ hoặc thiếu là trạng thái phải hiển thị, không phải lỗi phải
giấu.** Heartbeat quá 10 phút = reconciler có thể đã chết; đó là thông tin quan
trọng nhất app này có thể nói. Không bao giờ vẽ một con số cũ như thể nó đang sống.

Kiểu TypeScript của `status.json` viết tay ở `lib/bee/types.ts`, **đồng bộ tay**
với [`bin/reconcile.sh`](../../apps/reconciler/bin/reconcile.sh). Đổi một bên thì
đổi bên kia trong cùng commit.

---

## 8. Thông báo Slack

Một Incoming Webhook. Bắn khi có mục **mới** vào hộp thư của một người:

```
🐝 #44 chờ bạn duyệt spec · myapp
   "Thêm filter cho danh sách đơn hàng"
   → https://bee.<domain>/t/myapp/44
```

- **Gộp, không spam.** Nhiều mục trong 5 phút thì gộp thành một tin.
- Không bắn lại cho mục đã báo — trạng thái "đã báo" lưu ở đĩa.
- Không bắn khi người đó vừa thao tác trong app dưới 2 phút.

Bắn từ đâu: một route handler được gọi theo lịch, **không** phải từ reconciler —
giữ reconciler không biết gì về Slack.

---

## 9. Lệnh

```bash
pnpm dev                  # phát triển
pnpm lint                 # eslint, gồm cả no-restricted-imports cho barrel
pnpm typecheck            # tsc --noEmit
pnpm test                 # vitest
pnpm test:e2e             # playwright
pnpm build                # BẮT BUỘC — bắt lỗi Server/Client mà dev bỏ qua
```

Bốn lệnh `lint typecheck test build` phải xanh trước khi coi một task là xong.

---

## 10. Cấu trúc và code style

Xem [`AGENTS.md`](../../AGENTS.md) §4 và §7 — không nhắc lại ở đây. Bốn điều dễ vi phạm
nhất, nhắc lại vì chúng hỏng âm thầm:

1. Import chéo feature phải qua barrel. ESLint chặn `@/features/*/*`.
2. `page.tsx` quá ~100 dòng là tín hiệu cấu trúc bắt đầu hỏng.
3. Không copy dữ liệu server vào Zustand. Query sở hữu nó.
4. Query key là factory theo feature, không phải mảng viết thẳng.

---

## 11. Kiểm thử

| Tầng | Công cụ | Phủ cái gì |
|---|---|---|
| Component/hook | Vitest + Testing Library | Query theo role và label, không theo test id |
| API | **MSW** | Không tự stub `fetch` |
| E2E | Playwright | Đăng nhập · hộp thư · tạo task · duyệt PR · chat vào task |

**Ba tình huống bắt buộc có test, vì chúng là chỗ hỏng im lặng:**

- `status.json` thiếu / hỏng JSON / heartbeat cũ 30 phút → UI phải báo, không crash
- Người không có trong allowlist đăng nhập thành công → **không thấy gì**
- Route handler đọc bằng chứng với path `../../etc/bee/orch.env` → **bị từ chối**

---

## 12. Ranh giới

Đầy đủ ở [`AGENTS.md`](../../AGENTS.md) §2. Rút gọn:

**Không bao giờ:** giữ `GH_TOKEN` · merge PR · ghi vào `/srv/bee/**` · ghi vào
worktree · chạy `docker`/`systemctl`/`sudo`/`bee` · sửa state của reconciler ·
dùng token bot chung cho thao tác của người.

**Hỏi trước khi làm:** bất cứ thay đổi nào trong `apps/reconciler/` (spec này đã
biết trước đúng hai chỗ: §5 và §6) · thêm dependency runtime mới · đổi mô hình
đăng nhập.

**Luôn luôn:** mọi ghi lên GitHub mang token của đúng người vừa bấm · mọi route
handler tự kiểm session, không tin `proxy.ts` · `import "server-only"` cho mọi
module chạm đĩa hoặc token · hiển thị dữ liệu cũ **là** cũ.

---

## 13. Tiêu chí nghiệm thu V1

- [ ] Người ngoài allowlist đăng nhập được nhưng không thấy dữ liệu nào
- [ ] Hộp thư hiện đúng những mục đang chặn người đang đăng nhập, xếp theo thời gian chờ giảm dần
- [ ] Tạo task từ form → issue xuất hiện trên GitHub **mang tên người tạo**, có đủ 5 mục, gắn `status:ready-for-spec`
- [ ] Tick sau, comment của rule 08 hiện trong dòng thời gian của task mà không cần tải lại trang
- [ ] Gửi chat vào task → comment lên GitHub mang tên người gửi; UI hiện "chờ tick tiếp theo" rồi chuyển sang "agent đang làm"
- [ ] Video bằng chứng phát được ngay trong trang task, không tải file về
- [ ] PM bấm Duyệt → GitHub ghi nhận approve **mang tên PM**, `bee/approvals` chuyển xanh ở tick sau
- [ ] Techlead thấy link PR và mở được sang GitHub
- [ ] Tắt reconciler 15 phút → app vẫn lên, và **báo đỏ rằng reconciler có thể đã chết**
- [ ] Xoá `status.json` → app không crash, báo rõ chưa có dữ liệu
- [ ] Mở trên điện thoại: đọc được hộp thư và bấm được Duyệt
- [ ] `pnpm lint typecheck test build` xanh cả bốn

---

## 14. Việc chưa quyết

| | Ghi chú |
|---|---|
| Ai chạy `bee-web` và quyền đọc `/srv/bee/state/` | `state/<id>/` do orch tạo bằng `mkdir -p`, group có thể không phải `bee`. Cần đặt setgid như `work/` |
| Dọn `evidence/` | 90 ngày, hay xoá khi PR đóng, hay cả hai |
| Route handler bắn Slack được gọi bởi cái gì | systemd timer riêng, hay cron trong app |
