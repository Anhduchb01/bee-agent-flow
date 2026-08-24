# Tách bee sang user riêng — tháo ngòi cò súng #4

> **Vì sao:** `doctor` báo đỏ mục `may-sach` — máy có `~/.ssh/id_*` (3 khoá) và
> `~/.kube`. PRD §0.2 gọi đó là **cò súng #4**. Hôm nay chạy A+ với quyết định
> chấp nhận có ý thức (§0.2), nhưng V3 bỏ người ngồi cạnh: máy tự mở phiên lúc
> 2 giờ sáng. Tách user là cách **rẻ nhất** đưa thiệt hại tối đa về đúng mức
> PRD đã định giá.
>
> Đi kèm: [docker-cho-bee.md](docker-cho-bee.md) · [mo-hinh-c.md](mo-hinh-c.md)
> · [deploy.md](deploy.md)

---

## 1. Được gì, không được gì

**Được — kernel giữ, không phải lời hứa.** `/home/ducba` là mode `700`, nên user
`bee` không đọc được `~/.ssh`, `~/.kube`, `~/.claude` của con người. Supply
chain chiếm được agent thì lấy được PAT hẹp + token Claude + code bee đang làm
(**đúng cái giá PRD §0.1 đã ký**), không lấy được khoá SSH đi sang máy khác.

**Không được:**

- Chung kernel → lỗ leo thang quyền cục bộ vẫn xuyên qua (chỉ VM/LXC cắt được).
- Bee vẫn trong tailnet, vẫn nối được mọi cổng `127.0.0.1` mà `ducba` đang mở.
- **Nếu cho `bee` vào group `docker` thì mất sạch** — xem
  [docker-cho-bee.md §1](docker-cho-bee.md).

**Không mang sang được:** lịch sử hội thoại Claude nằm ở
`~/.claude/projects/-<đường-dẫn-worktree>/` của `ducba`, đánh khoá theo **đường
dẫn**. Home mới → đường dẫn mới → **phiên cũ không resume được nữa**. Copy
`~/.local/srv/bee` sang thì xem lại được (run.jsonl + evidence), nhưng bắt đầu
sạch là lựa chọn thành thật hơn.

---

## 2. Các bước

🧑 = cần bạn (root / tài khoản GitHub) · 🤖 = chạy dưới user `bee`, tự động được

### Bước 1 🧑 — tạo user (root)

```bash
sudo adduser bee                       # KHÔNG thêm vào sudo / adm / docker
sudo loginctl enable-linger bee        # phiên sống ngoài lúc đăng nhập
grep '^bee:' /etc/subuid /etc/subgid   # phải có dải subuid (adduser tự cấp)
```

Kiểm ngay — cả ba **phải** ra `Permission denied`:

```bash
sudo -u bee ls /home/ducba
sudo -u bee cat /home/ducba/.ssh/id_rsa
sudo -u bee ls /home/ducba/.kube
```

### Bước 2 🧑 — vá hai chỗ hở ở tầng hệ thống

```bash
# /proc không giấu tiến trình: bee đọc được DÒNG LỆNH của mọi tiến trình ducba,
# và token nằm trong argv là lộ.
echo 'proc /proc proc defaults,hidepid=2,gid=proc 0 0' | sudo tee -a /etc/fstab
sudo groupadd -f proc && sudo mount -o remount,hidepid=2,gid=proc /proc

# Rác của mô hình C — ba tài khoản ngủ đông, một cái tương đương root
getent group docker                    # bee-orch đang trong đó!
sudo gpasswd -d bee-orch docker
sudo rm -f /etc/sudoers.d/bee          # ranh giới cũ, không còn ai dùng
sudo userdel -r bee-orch bee-agent bee-web   # chỉ khi chắc không cần fallback tại chỗ
```

> Xoá ba user đó **không** làm mất đường lùi: mô hình C nằm ở nhánh
> `feat/bee-m3-and-web-spec` + `apps/reconciler/`, dựng lại bằng `install.sh`
> của nó — xem [mo-hinh-c.md §6](mo-hinh-c.md).

### Bước 3 🤖 — công cụ cho user bee

```bash
sudo -iu bee        # từ đây trở đi là user bee

# node + pnpm (nvm per-user, không đụng hệ thống)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
. ~/.nvm/nvm.sh && nvm install --lts && corepack enable

# claude
npm i -g @anthropic-ai/claude-code
claude setup-token          # dán token vào /setup của web, hoặc claude.env
```

### Bước 4 🧑 — GitHub bằng ĐÚNG danh tính

Đây cũng là chỗ sửa mục đỏ `pat` hôm nay: máy đang active tài khoản `ducba01`
với token OAuth `gho_` (scope `repo`, `workflow`), trong khi repo thuộc
`Anhduchb01`.

```bash
gh auth login --with-token < <(echo "github_pat_...")   # PAT HẸP của Anhduchb01
gh auth status          # phải: Anhduchb01, token github_pat_
gh repo view Anhduchb01/ecvision --json name   # phải đọc được
```

PAT hẹp = chỉ các repo làm việc, đúng ba quyền contents · pull-requests ·
issues (PRD §4.2 mục 2).

### Bước 5 🤖 — Docker rootless

Xem [docker-cho-bee.md §5](docker-cho-bee.md). Tóm tắt:

```bash
dockerd-rootless-setuptool.sh install     # tự in đoạn AppArmor cần sudo — chạy đúng cái nó in
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock   # thêm vào ~/.bashrc
systemctl --user enable --now docker
docker run --rm -v /home/ducba:/h alpine ls /h    # PHẢI: Permission denied
```

### Bước 6 🤖 — cài bee

```bash
git clone git@github.com:Anhduchb01/bee-agent-flow.git ~/bee-agent-flow
cd ~/bee-agent-flow && apps/runner/bin/deploy.sh
```

`deploy.sh` tự dò `BEE_PREFIX`/`BEE_ROOT`; user mới chưa có unit nào nên nó
dùng mặc định — đặt tay nếu muốn giống bố cục cũ:

```bash
BEE_PREFIX=~/.local/bee BEE_ROOT=~/.local/srv/bee apps/runner/bin/deploy.sh
```

Rồi mở `/setup` trên web để: dán token Claude · dán PAT · đăng ký repo · chạy
doctor · gỡ PAUSE.

### Bước 7 🧑 — Tailscale trỏ sang web mới

`tailscale serve` cần root hoặc operator; cấu hình nằm ở tầng hệ thống nên chỉ
làm **một lần**:

```bash
sudo tailscale serve --bg 3210     # bee bind 127.0.0.1:3210 như cũ
tailscale serve status
```

*(Muốn bee tự sửa được cấu hình serve thì `sudo tailscale set
--operator=bee` — nhưng đó là cấp thêm quyền, cân nhắc rồi hãy làm.)*

---

## 3. Nghiệm thu — xong nghĩa là gì

```bash
sudo -u bee cat /home/ducba/.ssh/id_rsa                  # Permission denied
sudo -u bee docker run --rm -v /home/ducba:/h alpine ls /h  # Permission denied
groups bee                                               # KHÔNG có docker, sudo, adm
~/.local/bee/bin/doctor.sh                               # may-sach XANH, pat XANH
curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:3210  # 307
```

`may-sach` xanh ở đây là **xanh thành thật** — bee thật sự không với tới được,
chứ không phải vì ta tắt cảnh báo.

Xong bước này thì cập nhật PRD §0.2: cò súng #4 **đã tháo ngòi**, quyết định
(a) hết hiệu lực, mô hình đe doạ về đúng phạm vi §0.1.

---

## 4. Quay lui

Cài đặt cũ dưới `ducba` **vẫn nguyên** cho tới khi bạn tự xoá. Bản mới hỏng thì:

```bash
sudo systemctl --user -M bee@ stop bee-web    # dừng bản mới
sudo -u ducba systemctl --user start bee-web  # bật lại bản cũ
sudo tailscale serve --bg 3210                # trỏ lại (nếu đã đổi cổng)
```

Chỉ xoá `~/.local/srv/bee` của `ducba` **sau khi** bản mới chạy được vài ngày —
đó là nơi giữ `run.jsonl` và evidence của 11 phiên cũ.

---

## 5. Việc còn treo sau khi tách

- **Tailscale ACL**: cấm node bee chủ động gọi sang máy khác trong tailnet. Tách
  user không đụng tới vị trí mạng.
- **`pnpm` chặn lifecycle script của dependency** — đường supply chain chính.
- **Branch protection thật trên `main`** (cần GitHub Pro cho repo private); hiện
  chỉ có fence `pre-push` cục bộ, mà chính nó tự nhận là *speed bump*.
