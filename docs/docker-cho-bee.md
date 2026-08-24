# Docker cho bee — rootless, và cách chia dịch vụ

> Bee cần Docker thật: repo của chủ dự án chạy Postgres, Redis, RabbitMQ, MinIO
> qua `docker compose`. Tài liệu này giải thích **vì sao không được cho bee vào
> group `docker`**, rootless thay thế thế nào, và kiến trúc chia dịch vụ để n
> phiên chạy song song mà không giẫm chân nhau.
>
> Đi kèm: [tach-user.md](tach-user.md) (tách user), [mo-hinh-c.md](mo-hinh-c.md)
> (đường lùi), PRD §0.2 (cò súng).

---

## 1. Group `docker` là root — không có mức nào ở giữa

```
/var/run/docker.sock   srw-rw----  root:docker
```

`dockerd` chạy **as root**. Ai mở được socket đó thì **nhờ được root làm hộ**:

```bash
docker run -v /:/host alpine cat /host/home/ducba/.ssh/id_rsa   # đọc khoá SSH
docker run -v /etc:/etc alpine sh -c 'echo "bee ALL=(ALL) NOPASSWD:ALL" >>/etc/sudoers.d/x'
```

Container **không phải hàng rào** ở đây — chính quyền *tạo* container là quyền
root, vì API tạo container luôn kèm `-v`, `--privileged`, `--pid=host`. Không
có cấu hình nào cho phép "chỉ được chạy postgres thôi".

**Hệ quả:** thêm `bee` vào group `docker` là xoá sạch việc tách user. Home
`/home/ducba` mode 700 trở thành vô nghĩa.

---

## 2. Rootless Docker: đảo đúng chỗ đó

```
Docker thường                        Rootless
──────────────────────               ──────────────────────
dockerd chạy uid 0                   dockerd chạy uid của bee
socket /var/run/docker.sock          socket /run/user/<uid>/docker.sock
  (group docker mở được)               (chỉ bee mở được)
"root" trong container = uid 0 THẬT  "root" trong container = subuid của bee
  → mount /, ghi /etc, đọc mọi home    → đúng quyền của bee, không hơn
```

**subuid** là dải UID hệ thống cấp riêng cho từng user (`/etc/subuid`). Trong
container, tiến trình thấy mình là root — `apt install` được, `chown` được —
nhưng ra tới kernel nó là một UID vô danh **không sở hữu gì**.

### Vì sao an toàn — nhìn đúng đòn tấn công

| | Docker root | Rootless |
|---|---|---|
| Ai thực hiện mount | daemon **root** | daemon chạy **as bee** |
| Kernel kiểm quyền theo | root → qua mọi hàng rào | bee → `/home/ducba` mode 700 → **EACCES** |
| Kết quả | đọc được khoá SSH | `Permission denied` |

Nói cho đúng bản chất: **rootless không làm container chắc hơn — nó bỏ phần
khuếch đại đặc quyền.** Bán kính thiệt hại co lại đúng bằng những gì bee vốn đã
có (PAT hẹp, token Claude, code bee đang làm) — tức đúng cái giá PRD §0.1 đã
định giá, không lan sang tài sản của con người.

### Nghiệm thu bằng một dòng

Chạy dưới user bee sau khi cài xong. **Phải** ra `Permission denied`:

```bash
docker run --rm -v /home/ducba:/h alpine ls /h
```

### Đánh đổi (đo trên máy này, 24/08)

| Đánh đổi | Ảnh hưởng thật |
|---|---|
| Cổng < 1024 cần cấu hình thêm | **Không dính**: 5432 · 6379 · 5672 · 9000 đều > 1024 |
| Mạng qua slirp4netns/pasta | Chậm hơn ở throughput lớn; DB dev không cảm nhận được |
| `--network host` = mạng của namespace, không phải host thật | Chỉ dính nếu repo dựa vào host network; publish cổng vẫn thường |
| Image/volume store **riêng** (`~/.local/share/docker`) | Ducba đang có 87GB image; bee tải lại phần nó cần (~5–15GB) |
| AppArmor trên Ubuntu 24.04 | `kernel.apparmor_restrict_unprivileged_userns=1` → cần root **một lần**, xem §5 |

---

## 3. Kiến trúc: chia theo "có trạng thái" hay không

**"Dùng chung" nghĩa là chung giữa các phiên bee — KHÔNG phải chung với stack
của con người.** Bee có stack dịch vụ riêng, chạy bằng rootless của chính nó;
stack `ducba` đang chạy không bị đụng, và bee không có cửa phá DB dev của bạn.

```
bee-services  (rootless, một stack, luôn sống)              ~500MB RAM
   postgres  127.0.0.1:55432      ← nặng + CÓ TRẠNG THÁI → dùng chung
   rabbitmq  127.0.0.1:55672
   minio     127.0.0.1:59000

phiên bee/<slug>-<num>  (rootless compose trong work/<id>)
   redis                          ← 8MB, rẻ hơn cả việc chia → mỗi phiên một cái
   api · worker · frontend        ← code đang sửa → mỗi phiên một bản
   cổng: một dải 10 cổng liên tiếp, cấp lúc mở phiên (§4)
```

**Vì sao không để mỗi phiên dựng nguyên stack:** một stack ecvision đang tốn
~1.6GB RAM (worker 827MB, minio 268MB, postgres 180MB…). Máy còn ~15GB khả
dụng. Ba phiên đêm = ~5GB chỉ riêng dịch vụ, cộng ~1GB `node_modules` mỗi
worktree, chưa kể mỗi lần khởi động phải chờ postgres init + migrate.

**Vì sao Redis lại nằm ở lane per-phiên:** nó chỉ tốn 8.6MB. Chia database
index thì vướng trần 16 DB mặc định; dựng hẳn một container cho mỗi phiên vừa
rẻ hơn vừa hết chuyện.

### Mỗi phiên nhận một lát của dịch vụ chung

| Dịch vụ | Lát riêng | Chi phí |
|---|---|---|
| Postgres | database `bee_<slug>_<num>` + **role riêng chỉ có quyền trên database đó** | ~8MB |
| RabbitMQ | vhost `/bee_<slug>_<num>` + user riêng | ~0 |
| MinIO | bucket `bee-<slug>-<num>` + access key riêng | ~0 |

**Role riêng làm ngay từ đầu, đừng để sau.** Không có nó thì một phiên gõ nhầm
`DROP DATABASE` là phiên khác chết theo — đúng loại hỏng mà chạy-đêm không ai
ngồi cạnh sẽ khuếch đại.

---

## 4. Cổng: cấp theo phiên, không hard-code

Compose của ecvision may là đã tham số hoá sẵn:

```yaml
- "127.0.0.1:${POSTGRES_PORT:-5432}:5432"
- "127.0.0.1:${REDIS_PORT:-6379}:6379"
```

Nên chỉ cần một file `.env` cho mỗi phiên. **Không** dùng công thức tĩnh kiểu
`54000 + num`: hai repo khác nhau có thể cùng `num`, và cổng có thể đã bị thứ
khác chiếm. Thiết kế: lúc mở phiên, quét tìm **dải 10 cổng trống liên tiếp** từ
54000, ghi vào `session.json`, rồi sinh `.env` trong worktree. Ghi vào
`session.json` để lần resume sau vẫn đúng dải cũ.

Cơ chế bơm vào worktree **đã có sẵn**: `env.d` chép file env vào worktree và
thêm chúng vào `info/exclude` — agent đọc được key nhưng không commit được.
Việc còn thiếu chỉ là mở rộng từ *per-repo* sang *per-phiên* (task V3.T14).

---

## 5. Cài rootless cho user bee

Máy đã có sẵn `docker-ce-rootless-extras`, `rootlesskit`, `uidmap`,
`slirp4netns`, `dbus-user-session` — nên phần cài chỉ là chạy script.

```bash
# --- dưới user bee ---
dockerd-rootless-setuptool.sh install
```

Script sẽ **tự phát hiện AppArmor** và in ra đoạn profile cần cài kèm lệnh
`sudo` chính xác cho máy này — **chạy đúng cái nó in ra**, đừng chép từ blog.
Hình dạng profile là:

```
# /etc/apparmor.d/home.bee.bin.rootlesskit
abi <abi/4.0>,
include <tunables/global>
"/home/bee/bin/rootlesskit" flags=(unconfined) {
  userns,
  include if exists <local/home.bee.bin.rootlesskit>
}
```

*(Đường lùi thô hơn, không khuyến khích vì nó hạ hàng rào cho **cả máy**:
`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`.)*

Sau đó:

```bash
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock   # thêm vào ~/.bashrc
systemctl --user enable --now docker
docker info | grep -i rootless        # phải thấy "rootless" trong Security Options
docker run --rm -v /home/ducba:/h alpine ls /h   # phải: Permission denied
```

`loginctl enable-linger bee` (cần root) là bắt buộc — không có nó thì daemon
chết khi bee đăng xuất, và phiên đêm chết theo.

---

## 6. Dọn: việc của gc, không phải của trí nhớ

Khi gc (V3.T1) thu hồi một worktree, phải dọn cả phần docker của phiên đó —
nếu không volume mồ côi tích lại (máy đang có 6.9GB volume / 17 cái):

```bash
docker compose -p bee-<slug>-<num> down -v            # container + volume của phiên
psql -c 'DROP DATABASE IF EXISTS bee_<slug>_<num>'    # lát Postgres
psql -c 'DROP ROLE IF EXISTS bee_<slug>_<num>'
rabbitmqctl delete_vhost /bee_<slug>_<num>
mc rb --force local/bee-<slug>-<num>
```

Cùng chính sách với worktree (spec V3.D3): chỉ dọn khi phiên đã kết thúc, không
`needs_human`, và nhánh đã merged hoặc đã push hết.

---

## 7. Cái rootless KHÔNG sửa được

- **Chung kernel với `ducba`.** Một lỗ leo thang quyền cục bộ vẫn xuyên qua.
  Chỉ VM/LXC mới cắt — lúc đó trong VM cho docker chạy root thoải mái, vì root
  ấy chỉ là root của VM.
- **Vị trí mạng.** Bee vẫn trong tailnet và vẫn gọi ra được; muốn chặn thì dùng
  Tailscale ACL, việc riêng.
- **Localhost của máy.** Bee vẫn nối được tới mọi cổng `127.0.0.1` mà `ducba`
  đang mở (kong, langfuse, stack ecvision…). Nếu bận tâm, cân nhắc netns riêng
  hoặc chuyển hẳn sang VM.

Thứ tự mạnh dần:

```
VM/LXC  >  user riêng + rootless  >  user riêng + dịch vụ chung
        ≫  user riêng + group docker (= không cách ly gì)
```
