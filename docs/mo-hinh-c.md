# Mô hình C — đường lùi, và nó chính xác là cái gì

> Tài liệu này tồn tại để **sáu tháng nữa còn hiểu được** mình đã bỏ cái gì và
> lấy lại bằng cách nào. Hôm nay bee chạy **mô hình A+** (một UID, ranh giới là
> vỏ máy + hàng rào GitHub). Mô hình C là bản hai UID đã nghiệm thu trên máy
> thật rồi đóng băng.
>
> **Trạng thái 24/08/2026:** vẫn chạy A+. Cò súng #4 **đã nổ** (máy có SSH key
> + `~/.kube`) và chủ dự án **chấp nhận có ý thức** — xem §5.
>
> Mã nguồn: nhánh `feat/bee-m3-and-web-spec`, chốt tại `5b51dab`, và
> `apps/reconciler/` vẫn còn nguyên trên nhánh hiện tại.

---

## 1. Một câu

**A+:** một user `bee` chạy tất cả — web, agent, `gh`, token. Ranh giới là vỏ
máy: *"máy này không chứa gì đáng lấy"*.

**C:** hai user Linux, và **kernel** giữ ranh giới thay cho lời hứa:

| | `bee-orch` | `bee-agent` | `bee-web` |
|---|---|---|---|
| Cầm gì | `GH_TOKEN`, thuộc group `docker` (≈ root) | login Claude Code | không gì cả |
| Đọc nội dung không tin cậy? | **Không** | Có (issue, comment, code) | Có (HTTP từ internet) |
| sudo | đúng **một** dòng (xem §2) | không | không |

Bất biến của C: **tiến trình cầm credential không bao giờ đọc nội dung không
tin cậy.** Agent đọc issue của người lạ thì agent không được cầm token; orch
cầm token thì orch chỉ nhìn nhãn và trạng thái, không đọc chữ.

---

## 2. Ranh giới được giữ bằng gì (5 mảnh, tất cả còn trong repo)

**1 · Hai UID.** Vì sao không phải hai biến môi trường: cùng một UID đọc được
`/proc/<pid>/environ` của tiến trình cha, nên lọc env lúc spawn không ngăn được
gì. Khác UID thì kernel chặn.

**2 · `sudoers/bee` — đúng một dòng, cố ý:**

```
bee-orch ALL=(bee-agent) NOPASSWD: /opt/bee/bin/agent-exec.sh
```

`sudo` bật `env_reset` mặc định, nên "agent không thấy token" là do sudo lo,
không phải do script nhớ lọc. **Đừng nới thành thư mục hay wildcard** — agent
ghi được vào worktree, nên bất kỳ đường nào cho nó chọn file thực thi đều là
đường thoát khỏi ranh giới này.

**3 · `polkit/49-bee.rules`** — cho `bee-orch` start `bee-task@*.service`. Thiếu
nó thì `systemctl start` trả *"Interactive authentication required"* và hỏng
theo kiểu tệ nhất: claim đã ghi, `set -e` giết script trước khi
`heartbeat_write` chạy, dashboard đóng băng ở ảnh cũ trong khi mỗi tick đều đổ.

**4 · Cầu socket `spec-chat.mjs`** — web cần một cửa sổ chat trả lời trong vài
giây, nhưng web là user duy nhất đưa ra internet nên **không được** cầm login
Claude. Lời giải: một tiến trình chạy dưới `bee-agent`, nghe Unix socket mà chỉ
group `bee-web` mở được; không cổng TCP nào để quét, **không tool nào được bật**.

**5 · Hàng đợi bằng nhãn GitHub + `rules/`** — orch mỗi tick đọc nhãn, chọn
việc, `sudo` sang agent để chạy. 9 rule: `01-recover-stale` (dọn xác) ·
`02-review-feedback` · `03-run-ci` · `04-evidence` · `05-approvals` ·
`06-preview` · `07-build` · `08-spec` · `09-reindex`.

---

## 3. A+ đã bỏ cái gì, đổi lấy cái gì

| C có | A+ thay bằng |
|---|---|
| sudoers + polkit + hai UID | không gì cả — cùng user, `systemctl --user` |
| cầu socket spec-chat | phiên chat thẳng, FIFO + `run.jsonl` |
| hàng đợi nhãn + 9 rule | phiên là đối tượng gốc, agent tự gọi `gh` bằng skill |
| broker/spool cho mọi thao tác cần token | PAT hẹp đưa thẳng cho agent |

**Cái được:** hết "thuế năng lực" — mỗi quyền mới không còn phải sửa broker, và
mất hẳn một họ lỗi hỏng-im-lặng (polkit, socket, spool).

**Cái mất — và đây là giá thật:** nếu agent bị chiếm (chủ yếu qua supply chain
npm), nó cầm luôn PAT và login Claude. PRD §0.1 định giá cái mất đó là *"code
private bị đọc trộm"* — **với điều kiện máy chuyên dụng, trong vỏ máy không có
gì khác**. Điều kiện đó hôm nay **không còn đúng** (§5).

---

## 4. Khi nào phải quay về C — 5 cò súng (PRD §0.2)

| # | Điều kiện | Trạng thái 24/08 |
|---|---|---|
| 1 | Repo nào đó chuyển **public** | chưa |
| 2 | Có **người thứ hai** dùng thật | chưa |
| 3 | Bật lại đọc comment PR từ người ngoài | chưa |
| 4 | Máy bắt đầu chứa **secret khác** | **ĐÃ NỔ** — `~/.ssh/id_*` (3 khoá), `~/.kube` |
| 5 | Làm code cho khách / có nghĩa vụ bảo mật | chưa |

---

## 5. Quyết định 24/08/2026 — chấp nhận có ý thức (D1a)

Cò súng #4 đã nổ. Chủ dự án chọn **(a) chấp nhận có ý thức**, không chuyển C,
không tách máy — *tạm thời*. Ghi lại cho sòng phẳng:

- **Mô hình đe doạ thật bây giờ rộng hơn PRD §0.1 đã định giá.** Agent bị chiếm
  không chỉ đọc được code private mà còn cầm được **SSH key đi sang máy khác**
  và `~/.kube`. Đây không phải "code cá nhân lộ thì thiệt ít" nữa.
- **Việc này đắt hơn kể từ V3**, vì V3 bỏ người ngồi cạnh: máy tự mở phiên lúc
  2 giờ sáng theo hàng đợi.
- **Rẻ nhất để hạ rủi ro mà không cần C:** chuyển 3 SSH key + kube config sang
  máy khác (hoặc chạy bee trong VM/LXC riêng). `deploy.sh` đã tham số hoá
  `BEE_PREFIX`/`BEE_ROOT` nên đổi máy là một buổi tối, không phải một dự án.
- **`doctor` vẫn báo đỏ mục `may-sach` và ĐỪNG tắt nó.** Đỏ ở đây là đúng: nó
  đang nói sự thật. Tắt cảnh báo để màn hình xanh là bắt đầu con đường "A+ trôi
  thành A cẩu thả" mà PRD §6.2 gọi tên.

Đổi ý lúc nào thì đọc §6.

---

## 6. Quay về C bằng cách nào

1. `git checkout feat/bee-m3-and-web-spec` (chốt `5b51dab`) — toàn bộ mô hình
   cũ còn nguyên, **đã nghiệm thu M0/M2 trên máy thật**.
2. Tạo lại hai user + group, chạy `apps/reconciler/install.sh`: nó cài
   `sudoers.d/bee`, `polkit-1/rules.d/49-bee.rules`, `bee.slice` và họ unit
   `bee-reconcile.timer` / `bee-task@`.
3. Cấp lại credential **tách đôi**: `GH_TOKEN` cho `bee-orch`, login Claude cho
   `bee-agent`, và bảo đảm `bee-web` không cầm gì.
4. Việc phải làm bằng tay: mang dữ liệu phiên sang mô hình nhãn (hai mô hình
   không chung định dạng trạng thái — C dùng `status.json` + nhãn issue, A+ dùng
   `sessions/<id>/`).

**Nếu chỉ muốn siết một phần mà không quay về C hẳn** (thứ tự rẻ → đắt): tách
máy/VM · `pnpm` chặn lifecycle script của dependency · Tailscale ACL cấm máy bee
chủ động gọi sang máy khác · bật branch protection thật trên `main` (cần GitHub
Pro cho repo private).

---

## 7. Liên quan

- [PRD §0.1 + §0.2](PRD_bee-agent-flow.md) — cuộc tranh luận A+ vs C và bảng cò súng
- [architecture.html](architecture.html) — bất biến hiện hành, phần "A+ — hàng rào nằm đâu"
- `apps/reconciler/` — mã nguồn mô hình C, còn nguyên trên nhánh này
