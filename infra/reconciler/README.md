# bee reconciler

Điều phối agent trên một máy Ubuntu. Không GitHub Actions, không webhook — một
tiến trình cứ 30 giây đối chiếu trạng thái trên GitHub với thực tế và làm **đúng
một việc** để kéo hai bên về gần nhau.

Thiết kế đầy đủ: [`docs/AGENT_RECONCILER.md`](../../docs/AGENT_RECONCILER.md) ·
kiến trúc tổng thể: [`docs/AGENT_FLOW.md`](../../docs/AGENT_FLOW.md)

---

## Cài

```bash
git clone git@github.com:org/bee-agent-flow.git ~/bee-src
sudo ~/bee-src/infra/reconciler/install.sh
```

Idempotent — chạy lại bao nhiêu lần cũng vô hại. `--no-deps` để bỏ qua phần cài gói.

Cài xong hệ thống **nằm im** (`/etc/bee/PAUSE` được tạo sẵn). Còn 5 việc cần
người, script in ra ở cuối; tóm tắt:

```bash
sudo -u bee-agent -H claude        # /login  ← ĐÚNG user này, không phải user của bạn
sudo -u bee-orch  -H gh auth login
sudo $EDITOR /etc/bee/orch.env     # GH_TOKEN (fine-grained, KHÔNG cấp Workflows)
be repo add org/ten-repo
be doctor && be dry-run && be resume
```

---

## Bố cục

| | |
|---|---|
| `install.sh` | cài một lần, idempotent |
| `bin/reconcile.sh` | **dispatcher** — chọn 1 việc, giao, thoát. Luôn < 5 giây |
| `bin/worker.sh` | chạy trong `bee-task@<slug>-<số>`, làm việc dài |
| `bin/agent-exec.sh` | **chạy dưới `bee-agent`** — tiến trình duy nhất gọi model |
| `bin/bee` | CLI: doctor, status, repo, pause, logs, dry-run, uninstall |
| `bin/heartbeat-check.sh` | bắt chế độ hỏng nguy hiểm nhất: reconciler chết im lặng |
| `lib/*.sh` | common, config, github, state |
| `rules/NN-*.sh` | **tên file = thứ tự ưu tiên** |
| `systemd/` | unit, template unit, slice giữ chỗ RAM/CPU |
| `sudoers/bee` | đúng một dòng — toàn bộ ranh giới token |

---

## Hai user, và vì sao

| | `bee-orch` | `bee-agent` |
|---|---|---|
| `GH_TOKEN` | có | **không** |
| group `docker` | có | **không** |
| sudo | không¹ | **không** |
| login Claude Code | không | có |

¹ orch chỉ được `sudo` sang đúng `agent-exec.sh`, không được gì khác.

Phải là **hai UID** chứ không phải hai biến môi trường: cùng một UID đọc được
`/proc/<pid>/environ` của tiến trình cha, nên lọc biến môi trường khi spawn
không ngăn được gì. Khác UID thì kernel chặn.

**Agent tuyệt đối không vào group `docker`.** Thuộc group đó tương đương quyền
root — `docker run -v /:/host` đọc được cả token lẫn `/home` của bạn, và toàn bộ
thiết kế sụp trong một dòng lệnh mà không để lại dấu hiệu nào. `install.sh` chủ
động gỡ agent khỏi group này nếu ai đó lỡ tay thêm vào, và `be doctor`
kiểm lại mỗi lần chạy.

---

## Nghiệm thu M0

Đừng cho agent chạy thật cho tới khi tất cả những dòng này đúng:

```bash
be doctor                        # mọi mục ✓
be dry-run                       # in ra nó ĐỊNH làm gì, chưa làm gì

sudo -u bee-agent env | grep -i token     # phải RỖNG
id -nG bee-agent | grep -w docker         # phải RỖNG
sudo -u bee-agent -n true                 # phải FAIL

systemctl start bee-task@test-1           # lần 1: chạy
systemctl start bee-task@test-1           # lần 2 khi đang chạy: BỊ TỪ CHỐI

journalctl -u bee-reconcile -n 50         # tick đều, không chồng nhau
```

Mốc này là mốc quan trọng nhất. Nếu bỏ qua, lúc agent ra kết quả sai bạn sẽ
không phân biệt được lỗi ở prompt hay ở hạ tầng của chính mình — debug hai ẩn
số cùng lúc.

---

## Vận hành hằng ngày

```bash
be status              # đang chạy gì, hàng đợi, lý do chờ
be logs omnilogin-42   # journalctl của một task
be pause               # dừng ngay; task đang chạy vẫn chạy nốt
be repo list
```

Kill switch có hai tầng: `/etc/bee/PAUSE` (ngay, cần SSH) và `.agent/PAUSE`
trên nhánh `main` của từng repo (PM tạo qua web GitHub trong 10 giây, và lưu vết
trong lịch sử git: ai dừng, lúc nào, vì sao).

---

## Chưa làm

| Rule | Trạng thái |
|---|---|
| 01 recover · 02 review · 03 CI · 05 approvals · 07 build · 08 spec · 09 reindex | có |
| 04 evidence | cần `scripts/ci.sh` và skill `e2e-evidence-capture` trong repo đích (M3) |
| 06 preview | mốc M6 — mới có phần scan |

Ngoài ra chưa có: prompt template trong `prompts/`, dashboard `public/index.html`
(reconciler đã ghi `status.json` sẵn), và `docker-compose.test.yml` phía repo đích.
