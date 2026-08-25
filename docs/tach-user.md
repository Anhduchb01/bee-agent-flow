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

# userdel nhận ĐÚNG MỘT login mỗi lần — gộp ba tên là lỗi cú pháp.
# -r xoá luôn home: xem trước có gì đáng giữ không (mô hình C để lịch sử
# hội thoại Claude ở /home/bee-agent/.claude/).
sudo du -sh /home/bee-orch /home/bee-agent /home/bee-web 2>/dev/null
sudo userdel -r bee-orch
sudo userdel -r bee-agent
sudo userdel -r bee-web
sudo groupdel bee 2>/dev/null || true  # group cũ, chỉ xoá được khi hết thành viên
sudo rm -rf /srv/bee                   # dữ liệu mô hình C (~2GB). KHÁC ~/.local/srv/bee đang chạy

# fstab vừa đổi nhưng systemd còn giữ bản cũ — chính nó sẽ nhắc dòng này.
sudo systemctl daemon-reload
```

> **⚠ Đừng để user mới tái dùng uid vừa giải phóng.** `adduser` sẽ cấp lại uid
> của `bee-orch` (1001), mà uid trong container **là** uid trên host: máy này
> đang có container chạy uid 1001 (`langfuse-*`). Hôm nay vô hại vì chúng không
> bind-mount vào host, nhưng đó là cái bẫy để dành. Tạo user với uid riêng
> trong lúc nó còn trống là gần như miễn phí:
>
> ```bash
> sudo useradd -m -u 1500 -U -s /bin/bash bee && sudo passwd -l bee
> grep '^bee:' /etc/subuid /etc/subgid   # trống thì:
> #   sudo usermod --add-subuids 1500000-1565535 --add-subgids 1500000-1565535 bee
> ```
>
> Lỡ tạo bằng uid cũ rồi thì đổi tại chỗ, đừng xoá — `userdel` sẽ báo *"user
> bee is currently used by process …"* vì `enable-linger` đã dựng sẵn một
> `systemd --user` cho nó:
>
> ```bash
> sudo loginctl disable-linger bee
> sudo loginctl terminate-user bee     # hạ systemd --user đang giữ tài khoản
> sudo usermod -u 1500 bee && sudo groupmod -g 1500 bee \
>   && sudo chown -R 1500:1500 /home/bee
> sudo loginctl enable-linger bee
> ```
>
> **Nối bằng `&&`, đừng viết ba dòng rời.** `usermod` rất hay trượt, và nếu
> `chown` vẫn chạy thì bạn được cái tệ nhất: home mang uid mới mà tài khoản
> còn uid cũ → `sudo -iu bee` ra *"unable to change directory to /home/bee:
> Permission denied"*.
>
> **`usermod` từ chối khi CÒN tiến trình mang uid đó** — và trên máy này chính
> container là thủ phạm: `langfuse-worker` và `kong-gateway` chạy uid 1001
> *bên trong*, mà uid trong container **là** uid trên host. Tức là đúng cái va
> chạm ta đang đi tránh lại là thứ chặn không cho tránh nó. Hai đường:
>
> - dừng mấy container đó 15 giây rồi `usermod` — sạch nhất nếu dừng được;
> - hoặc sửa thẳng một trường trong `/etc/passwd` (25/08 làm cách này):
>
> ```bash
> sudo cp /etc/passwd /etc/passwd.bak-bee-uid
> sudo sed -i 's|^bee:x:1001:1500:|bee:x:1500:1500:|' /etc/passwd
> sudo pwck -qr /etc/passwd && id bee
> ```
>
> Sửa thẳng an toàn ở ĐÚNG tình huống này vì không còn gì trỏ tới uid cũ:
> `/etc/shadow` không chứa uid, `/etc/subuid` và file linger đánh theo TÊN, và
> home đã `chown` sang 1500 rồi. Sau đó uid 1001 thành vô chủ — container vẫn
> chạy như cũ, chỉ không còn mượn danh `bee` nữa, đúng thứ ta muốn.
>
> (Dải subuid không đổi theo uid — `grep '^bee:' /etc/subuid` vẫn dùng được.)
> Làm lúc home còn trống là gần như miễn phí; sau khi đã cài thì `chown -R`
> phải quét cả `~/.local/srv/bee`.

> Xoá ba user đó **không** làm mất đường lùi: mô hình C nằm ở nhánh
> `feat/bee-m3-and-web-spec` + `apps/reconciler/`, dựng lại bằng `install.sh`
> của nó — xem [mo-hinh-c.md §6](mo-hinh-c.md).

### Bước 3 🧑 — gói hệ thống (lần duy nhất cần root)

Bảy gói, một lệnh. Đây là **toàn bộ** phần root còn lại của việc cài:

```bash
sudo apt-get update && sudo apt-get install -y \
  git curl jq gettext-base gh uidmap dbus-user-session
```

`gettext-base` cho `envsubst` (runner thay biến cổng trong `env.d`), `uidmap`
+ `dbus-user-session` cho Docker rootless. Quên cái nào thì `bootstrap.sh`
dừng ngay và in lại đúng dòng trên — không có kiểu hỏng ở tận đâu đó phía sau.

### Bước 4 🤖 — lấy code về

```bash
sudo -iu bee
git clone https://github.com/Anhduchb01/bee-agent-flow.git ~/bee-agent-flow
#   Username: Anhduchb01
#   Password: <dán PAT hẹp>     ← ở prompt, KHÔNG nhét vào URL:
#                                  URL sẽ nằm trong ~/.bash_history và trong
#                                  .git/config của mọi worktree sau này.
```

HTTPS chứ không phải SSH: bee **cố ý** không có khoá SSH nào — đó là toàn bộ
mục đích của việc tách user. (PAT này lát nữa dán lại một lần ở `/setup`, chỗ
đó mới là nơi `gh` và `git credential` nhớ nó.)

### Bước 5 🤖 — bootstrap: một lệnh, máy trắng thành máy chạy

```bash
~/bee-agent-flow/apps/runner/bin/bootstrap.sh
```

Nó làm, theo thứ tự, và **chạy lại vô hại**:

| | |
|---|---|
| 0 | chặn nếu đang ở group `docker`/`sudo`/`adm`, nối `systemd --user`, ghi 4 dòng môi trường vào `~/.bashrc` |
| 1 | soát bảy gói ở bước 3 |
| 2 | nvm + node LTS + pnpm (per-user, không đụng hệ thống) |
| 3 | `npm i -g @anthropic-ai/claude-code` |
| 4 | Docker rootless (`get.docker.com/rootless` → `~/bin`, không cần root) |
| 5 | `pnpm install` rồi `deploy.sh` với `BEE_PREFIX=~/.local/bee BEE_ROOT=~/.local/srv/bee` |

> **Vì sao bước 0 phải ghi `~/.bashrc`:** `sudo -iu bee` cho shell nhưng không
> cho session bus, nên mọi `systemctl --user` phía sau chết với *"Failed to
> connect to bus"* — trong khi bus vẫn nằm đó ở `/run/user/<uid>`, chỉ thiếu
> biến trỏ tới. Bootstrap tự đặt cho lần này và ghi lại cho các lần sau.

Cờ: `--no-docker` (bỏ bước 4) · `--khong-deploy` (chỉ cài công cụ) · `--fast`
(bỏ cổng lint/test khi deploy).

Từ đây trở đi việc **đưa code mới lên máy** là `deploy.sh`, không phải
bootstrap — xem [deploy.md](deploy.md).

### Bước 6 🧑 — phần còn lại làm trên web

Mở `127.0.0.1:3210` → `/setup`:

- **Token Claude** — chạy `claude setup-token` ở máy bất kỳ rồi dán vào.
- **PAT GitHub** — dán; trang chạy `gh auth login --with-token` qua stdin
  (không qua argv) rồi nối `git credential` vào đó. PAT hẹp = chỉ các repo làm
  việc, đúng ba quyền contents · pull-requests · issues (PRD §4.2 mục 2).
- Đăng ký repo · chạy doctor · **gỡ PAUSE**.

Chỗ này cũng sửa luôn mục đỏ `pat` hôm nay: máy đang active `ducba01` với
token OAuth `gho_`, trong khi repo thuộc `Anhduchb01`.

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
