# Mô hình C — đường lùi, và nó chính xác là cái gì

> Tài liệu này tồn tại để **sáu tháng nữa còn hiểu được** mình đã bỏ cái gì và
> lấy lại bằng cách nào. Hôm nay bee chạy **mô hình A+** (một UID `bee` riêng,
> ranh giới là uid + vỏ máy + hàng rào GitHub). Mô hình C là bản hai UID đã
> nghiệm thu trên máy thật rồi đóng băng.
>
> **Trạng thái 25/08/2026:** vẫn chạy A+, nhưng trên **user Linux riêng**.
> Cò súng #4 nổ 24/08 rồi **tháo ngòi 25/08** — quyết định "chấp nhận có ý
> thức" đã rút, xem §5.
>
> Mã nguồn: nhánh `feat/bee-m3-and-web-spec`, chốt tại `5b51dab`, và
> `apps/reconciler/` vẫn còn nguyên trên nhánh hiện tại.

---

## 1. Một câu

**A+:** một user `bee` chạy tất cả — web, agent, `gh`, token. Ranh giới là
**uid `bee` + vỏ máy**: mọi thứ bee với tới được đúng bằng cái giá §0.1 đã ký.
(Tới 24/08 ranh giới chỉ là vỏ máy — *"máy này không chứa gì đáng lấy"* — và
điều đó đã hết đúng khi máy có SSH key. Xem §5.)

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
private bị đọc trộm"* — **với điều kiện thứ agent với tới được không có gì
khác**. Từ 25/08 điều kiện đó được giữ bằng **uid riêng**, không phải bằng một
lời hứa về vỏ máy (§5).

---

## 4. Khi nào phải quay về C — 5 cò súng (PRD §0.2)

| # | Điều kiện | Trạng thái 25/08 |
|---|---|---|
| 1 | Repo nào đó chuyển **public** | chưa |
| 2 | Có **người thứ hai** dùng thật | chưa |
| 3 | Bật lại đọc comment PR từ người ngoài | chưa |
| 4 | Máy bắt đầu chứa **secret khác** | **chưa** — nổ 24/08, tháo ngòi 25/08 (§5) |
| 5 | Làm code cho khách / có nghĩa vụ bảo mật | chưa |

Đọc cột này theo đúng nghĩa "**bee** với tới được cái gì", không phải "**máy**
chứa cái gì": máy vẫn có 3 khoá SSH và `~/.kube` của `ducba`, nhưng chúng nằm
sau mode `700` của một home khác.

---

## 5. Cò súng #4: nổ 24/08 — tháo ngòi 25/08

### 5a · Quyết định 24/08 (D1a), đã RÚT

Cò súng #4 nổ vì `doctor` thấy `~/.ssh/id_*` (3 khoá) và `~/.kube`. Chủ dự án
chọn **(a) chấp nhận có ý thức** — không chuyển C, không tách máy, *tạm thời*.
Cái phải nói thẳng lúc đó: mô hình đe doạ rộng hơn PRD §0.1 đã định giá (agent
bị chiếm cầm được **SSH key đi sang máy khác**), và **đắt hơn kể từ V3** vì V3
bỏ người ngồi cạnh — máy tự mở phiên lúc 2 giờ sáng theo hàng đợi.

Quyết định này **hết hiệu lực từ 25/08**. Giữ lại đoạn trên vì nó là lý do
tồn tại của việc ở §5b, không phải vì nó còn đúng.

### 5b · Đã tháo ngòi bằng gì (M1, 25/08)

Không phải bằng cách tắt cảnh báo — bằng cách làm cho cảnh báo **hết đúng**:

- `bee` là user Linux riêng, uid/gid **1500**, `passwd -l`, **không** thuộc
  group `docker` / `sudo` / `adm`; linger bật; docker chạy **rootless**.
- `/home/ducba` mode `700` → kernel chặn, không phải lời hứa.
- Nghiệm thu đã chạy thật: `docker run -v /home/ducba:/h alpine ls /h` →
  *Permission denied*; `-v ~bee/.local/srv/bee` thì đọc được.
- `may-sach` trên máy bee **xanh thành thật**: bee thật sự không với tới được.

Hệ quả: thiệt hại tối đa khi agent bị chiếm quay về đúng phạm vi §0.1 — code
bee đang làm + PAT hẹp + token Claude. **Không** phải khoá SSH sang máy khác.

Đường đi thật, kể cả chỗ vấp: [tach-user.md](tach-user.md) ·
[docker-cho-bee.md](docker-cho-bee.md).

### 5c · Cái tách user KHÔNG mua được

Đừng đọc §5b rộng hơn nó thật:

- **Chung kernel.** Lỗ leo thang quyền cục bộ vẫn xuyên qua — chỉ VM/LXC cắt.
- **Chung tailnet.** bee vẫn nối được mọi cổng `127.0.0.1` mà `ducba` đang mở.
- **Cho `bee` vào group `docker` là mất sạch** — group docker ≈ root. Đó là lý
  do `bootstrap.sh` thoát ngay khi thấy mình ở trong group đó.
- Bốn cò súng còn lại **không** liên quan gì tới việc này; chúng vẫn nguyên.

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

**Nếu chỉ muốn siết một phần mà không quay về C hẳn** (thứ tự rẻ → đắt):
~~tách user Linux riêng~~ **đã làm 25/08 (§5b)** · `pnpm` chặn lifecycle script
của dependency · Tailscale ACL cấm máy bee chủ động gọi sang máy khác · bật
branch protection thật trên `main` (cần GitHub Pro cho repo private) · tách hẳn
sang VM/LXC (nấc duy nhất cắt được chung-kernel ở §5c).

---

## 7. Liên quan

- [PRD §0.1 + §0.2](PRD_bee-agent-flow.md) — cuộc tranh luận A+ vs C và bảng cò súng
- [architecture.html](architecture.html) — bất biến hiện hành, phần "A+ — hàng rào nằm đâu"
- `apps/reconciler/` — mã nguồn mô hình C, còn nguyên trên nhánh này
