# SPEC — V3.T15 Lát dịch vụ cho phiên

Bổ sung cho [`session-first.md`](session-first.md) và
[`docker-cho-bee.md`](../docker-cho-bee.md) §3–§6. Chốt qua một lượt hỏi–đáp
với chủ dự án ngày 26/08/2026, **trước khi viết dòng code nào**.

**Ý một câu:** mỗi phiên nhận một **lát** của các dịch vụ có trạng thái đang
chạy chung (database + role riêng, vhost + user riêng, bucket + key riêng), cấp
lúc dựng worktree và thu hồi cùng worktree — để hai phiên chạy song song lúc 2
giờ sáng không bao giờ ghi đè lên dữ liệu của nhau.

---

## 0. Những gì đã chốt

| # | Câu hỏi | Chốt | Ngày |
|---|---|---|---|
| 1 | Ai khai dịch vụ mà repo cần? | **bee tự đọc `docker-compose.yml` của repo và đoán kiểu từ image** | 26/08 |
| 2 | Đặt tên lát theo gì? | **8 ký tự đầu của session uuid** — không phải `<slug>-<num>` | 26/08 |
| 3 | Cấp lát bằng AI hay bằng rule? | **Rule.** Bash thuần + một bảng tra. Xem §2 | 26/08 |
| 4 | Pool định nghĩa ở đâu? | **Trên web**, không phải bằng lệnh | 26/08 |
| 5 | Màn cấu hình nằm đâu? | **Một trang, hai tab**: cài lần đầu + cấu hình | 26/08 |

**Cái vẫn còn phải gõ lệnh:** `deploy.sh`. Cập nhật code thì vẫn là shell, và
nên thế — nó chạy bốn cổng chất lượng trước khi cài.

---

## 1. Luật một dòng

> **Lát dịch vụ sống theo WORKTREE, không theo phiên.**
> Worktree còn thì database còn. Chỉ `gc` giết cả hai, cùng lúc, cùng luật D3.

Luật này trả lời trước cả ba cái kết của một phiên (§6). Nó cũng là lý do tên
lát phải **suy ra được** từ session id: gc chạy trong timer, không có ai để hỏi
"hôm đó đặt tên gì".

---

## 2. Rule, không AI — và vì sao không phải là chuyện sở thích

Ba tính chất của khối cấp lát, **mỗi cái một mình đã đủ** loại AI:

1. **Nó chạy lúc không ai ngồi cạnh.** Cấp lát ở mốc 5 — *trước khi* claude
   khởi động. Không có agent nào ở đó để hỏi. Với chạy đêm thì "không ai ngồi
   cạnh" là mặc định, không phải ngoại lệ.
2. **Nó cầm admin credential** của postgres/rabbitmq/minio. Cho một LLM soạn
   SQL bằng quyền superuser lúc 2 giờ sáng là đúng thứ PRD §0 và mô hình A+
   được dựng lên để tránh. Agent bị chiếm qua supply chain sẽ cầm luôn cái đó.
3. **gc phải thu hồi được**, cũng không người. Nó phải *suy ra* tên database từ
   session uuid, không phải *nhớ lại*.

Nên `service-slices.sh` là **bash thuần + một bảng tra**, test bằng rig như
`dung_worktree` / `capPhatDaiCong` / `chayMotNhip`.

**Chỗ AI thật sự làm việc là mốc 7** (§5): agent chạy trong worktree, bằng
quyền của phiên, tự `docker compose up` cái mà pool không có. Nó **không** cầm
admin cred, và hỏng thì hỏng trong sandbox của chính nó.

### 2b. Chỗ rule yếu thật — và cách vá không cần AI

bee biết nó vừa tạo `bee_a3f2c1`, nhưng **không biết repo gọi biến đó là gì** —
`DATABASE_URL`? `PG_DSN`? `DB_HOST` + `DB_PORT` + `DB_NAME`? Đây là nguyên tắc
đã chốt ở T14: *bee không biết tên biến của từng repo, và không nên biết.*

Lời giải dùng lại cơ chế đã có: `env.d/<slug>/` ngoài `${BEE_PORT_n}` nay nhận
thêm

```
${BEE_DB_URL}      ${BEE_DB_HOST} ${BEE_DB_PORT} ${BEE_DB_NAME}
${BEE_DB_USER}     ${BEE_DB_PASS}
${BEE_AMQP_URL}    ${BEE_AMQP_VHOST} ${BEE_AMQP_USER} ${BEE_AMQP_PASS}
${BEE_S3_ENDPOINT} ${BEE_S3_BUCKET} ${BEE_S3_KEY} ${BEE_S3_SECRET}
```

Người viết khuôn **một lần cho mỗi repo**, bee thay giá trị. Không đoán, không
AI. `chep_env_d` đã giới hạn envsubst đúng họ biến — mở rộng danh sách, giữ
nguyên kỷ luật (envsubst không giới hạn sẽ nuốt `$VAR` trong secret của repo).

---

## 3. Đoán kiểu từ image

Cùng **một hàm** chạy trên hai phía: compose của repo, và
`$BEE_ROOT/services/compose.yml` (pool). Ghép hai bên **theo kiểu**, không theo
tên service — nên repo không bị buộc đặt tên trùng với pool.

| Image khớp | Kiểu | Mặc định |
|---|---|---|
| `postgres*` · `postgis/*` · `pgvector/*` | `postgres` | pool → cấp lát |
| `rabbitmq*` | `rabbitmq` | pool → cấp lát |
| `minio/minio*` | `s3` | pool → cấp lát |
| `mysql*` · `mariadb*` | `mysql` | pool → cấp lát |
| `redis*` · `valkey*` | `redis` | rẻ (~8MB) → **dựng riêng** |
| không khớp gì | — | **dựng riêng** |

**Đoán sai thì nghiêng về "dựng riêng", không nghiêng về "cấp lát".**
Cấp lát sai kiểu = ghi vào một database không phải của mình. Dựng riêng thừa =
tốn ít RAM và tự lộ ra ngay. Hai sai lầm không cùng giá, nên mặc định phải
nghiêng về cái rẻ hơn.

**Đoán trượt trong im lặng là chế độ hỏng tệ nhất của lựa chọn này**: bạn thêm
một service vào pool để dùng chung, bee không nhận ra, và mọi phiên lặng lẽ tự
dựng bản riêng — RAM đi mất mà không ai nói gì. §7 bắt màn Settings phải nói ra
ngay lúc thêm; §8 bắt doctor phải nói ra hằng ngày.

---

## 4. Khuôn tên và nơi cất credential

```
uuid8 = 8 ký tự đầu của session uuid, bỏ dấu gạch      vd: a3f2c1d0

database / role     bee_<uuid8>          bee_a3f2c1d0
vhost / user        /bee_<uuid8>         /bee_a3f2c1d0
bucket / access key bee-<uuid8>          bee-a3f2c1d0
compose project     bee-<uuid8>          bee-a3f2c1d0
```

**Vì sao uuid chứ không phải `<slug>-<num>`:** cả hai đường mở phiên đều tính
`num = số phiên cùng slug + 1` mà không khoá ([sessions/api/actions.ts],
[lib/bee/tick.ts]). Mở hai phiên cùng lúc cho một repo → **cùng `num`**. Hôm
nay git chặn lại (nhánh đã có worktree khác giữ) nên hỏng ồn ào; nhưng một
database thì không có ai chặn — hai phiên sẽ **im lặng dùng chung** đúng cái mà
"role riêng" sinh ra để ngăn.

**Credential gốc nằm ở `sessions/<id>/services.json`** (mode 600), *không phải*
chỉ trong worktree: gc xoá worktree nhưng **không bao giờ** đụng
`sessions/<id>/` (hợp đồng spec §4.7 + D3). `.bee/services.env` trong worktree
là bản sao để repo đọc.

---

## 5. Flow đầy đủ

```
1  Mở phiên          web · moPhien                        [đã có]
   └─ cấp dải 10 cổng trống → session.json.port_base
   └─ CHƯA đụng dịch vụ: chưa có worktree nên chưa đọc được compose

2  Unit khởi động    bee-session@<uuid>                    [đã có]
   └─ chặn id bẩn → chặn PAUSE → chặn repo chưa đăng ký
   └─ meta.status = running · trap don_dep cài cho MỌI lối ra

3  Repo              bare clone/fetch + worktree           [đã có]
   └─ nhánh bee/<slug>-<num>

4  Cổng + env        ghi_cong · chep_env_d                 [đã có]
   └─ .bee/ports.env · env.d/<slug>/* → worktree · cả hai vào info/exclude

5  LÁT DỊCH VỤ       service-slices.sh cap <uuid>             [T15]
   ├─ đọc compose trong worktree → đoán kiểu từng image (§3)
   ├─ đọc pool services/compose.yml → đoán kiểu y hệt
   ├─ kiểu CÓ trong pool → cấp lát, idempotent (CREATE … IF NOT EXISTS):
   │     postgres  CREATE ROLE bee_<uuid8> LOGIN PASSWORD <random>
   │               CREATE DATABASE bee_<uuid8> OWNER bee_<uuid8>
   │               REVOKE CONNECT ON DATABASE … FROM PUBLIC
   │     rabbitmq  add_vhost /bee_<uuid8> · add_user · set_permissions
   │     s3        mc mb bee-<uuid8> · mc admin user add · policy CHỈ bucket đó
   ├─ kiểu KHÔNG có trong pool → chưa dựng gì, chỉ ghi lifecycle:
   │     "redis không có trong pool — sẽ dựng riêng khi bạn chạy compose"
   ├─ ghi sessions/<id>/services.json (600)  ← BẢN GỐC
   ├─ ghi .bee/services.env (600, git-exclude) ← bản sao cho repo
   └─ pool CHẾT mà repo cần → phiên TỪ CHỐI khởi động:
         meta=failed + reason đọc được, KHÔNG mở rồi để agent đâm vào
         connection refused sau 20 phút

6  Claude chạy                                             [đã có]
   └─ agent đọc .bee/services.env như mọi biến môi trường khác

7  Agent chạy app    /preview hoặc compose up              [đã có đường]
   └─ COMPOSE_PROJECT_NAME=bee-<uuid8> · cổng từ .bee/ports.env
   └─ dựng những kiểu KHÔNG có trong pool; phần còn lại trỏ vào pool

8  Kết thúc          trap don_dep                          [đã có]
   └─ usage.json từ dòng result cuối · meta = done/stopped/failed
   └─ KHÔNG đụng worktree, KHÔNG đụng lát dịch vụ
```

**Vì sao không cấp sớm hơn mốc 5:** compose nằm *trong repo*, mà lúc `moPhien`
chạy (phía web) chưa có worktree — runner mới là chỗ clone. Mốc sớm nhất đọc
được compose là sau `dung_worktree`. Điều này tự loại phương án "cấp cùng lúc
cấp cổng".

**Vì sao lát cấp sớm còn container thì không:** lát là *metadata* (~8MB, gần
như tức thì); container là *RAM* (hàng trăm MB, và thường không cần). Ranh giới
đó không phải sở thích — nó là chỗ chi phí nhảy bậc.

---

## 6. Ba cái kết của một phiên

| Người dùng làm gì | Xảy ra ngay | Lát dịch vụ | Dữ liệu trong db |
|---|---|---|---|
| **Chat tiếp** (`Continue`) | unit start lại → `session-run` chạy lại từ mốc 2 | **Cấp lại là no-op** — `IF NOT EXISTS`, password đọc từ `sessions/<id>/services.json`, không sinh mới | **Còn nguyên** |
| **Dừng phiên** (nút ■) | trap ghi `stopped`, dọn FIFO | **Giữ nguyên** — vì có thể Continue | Còn nguyên |
| **Merge PR trên GitHub** | **Không có gì xảy ra trên bee** | Giữ nguyên | Còn nguyên |

**Merge không dọn gì cả.** Chỉ `gc` dọn, theo luật D3 — *đã kết thúc ∧ không
`needs_human` ∧ quá 24h ∧ nhánh đã merged hoặc đã push hết*. Nên sau khi merge,
database của phiên còn sống **ít nhất 24 giờ**. Đây là chỗ dễ hiểu nhầm nhất
của cả spec.

### Hai hệ quả phải hiện ra màn hình, không để người dùng tự phát hiện

**Continue sau khi gc đã dọn = database rỗng.** Worktree dựng lại, lát cấp lại
từ đầu. Đúng luật (gc chỉ dọn khi code đã rời máy), nhưng bắt buộc ghi một dòng
lifecycle ngay lúc đó:

> *"Worktree và database của phiên này đã được thu hồi ngày dd/mm — đang dựng
> lại từ nhánh. Dữ liệu trong database KHÔNG còn."*

**Phiên `needs_human` không bao giờ bị dọn**, nên lát của nó sống mãi. Đó là
chủ ý (`gc.sh`: *"THÀ GIỮ NHẦM CÒN HƠN XOÁ NHẦM"*), nhưng nghĩa là một phiên
chết mà quên xem sẽ giữ database vô hạn. Doctor phải đếm (§8).

---

## 7. gc thu hồi — cả gói, một lượt

Khi `gc.sh` quyết thu hồi một worktree theo D3, nó làm **cả gói**, theo thứ tự
này (container trước, lát sau — một container còn sống mà database bị drop dưới
chân nó sẽ đổ log rác đầy đĩa):

```bash
docker compose -p bee-<uuid8> down -v      # container + volume per-phiên
psql  -c 'DROP DATABASE IF EXISTS bee_<uuid8>'
psql  -c 'DROP ROLE     IF EXISTS bee_<uuid8>'
rabbitmqctl delete_vhost /bee_<uuid8>  ·  delete_user bee_<uuid8>
mc rb --force local/bee-<uuid8>        ·  mc admin user rm local bee-<uuid8>
rm -rf work/<uuid>
```

`sessions/<uuid>/` **không bị đụng** — `run.jsonl`, evidence, `usage.json`,
`services.json` ở lại. "Dọn rồi vẫn xem lại được" là hợp đồng đã có.

`gc.json` ghi **từng thứ đã thu và lý do GIỮ từng cái**, cùng khuôn hiện tại —
để không ai phải đoán vì sao đĩa chưa giảm.

> **Nợ đã tồn tại, trước cả T15:** `gc.sh` hôm nay **không có một dòng docker
> nào**. Agent tự `docker compose up -d` (không qua `bee-preview`) thì gc xoá
> worktree xong container + volume nằm lại vĩnh viễn. Máy đang có 6.9GB volume
> / 17 cái từ thời `ducba` là bằng chứng chuyện đó xảy ra thật. Phần
> `compose down -v` nên làm **ngay**, không cần chờ trọn T15.

---

## 8. Doctor — mục `dich-vu`

Đỏ/xanh theo ba câu, cùng kỷ luật với mục `web` (T19) và `dia-phien` (T2):

- **Pool có sống không** — mỗi service trong `services/compose.yml` có container
  đang chạy và cổng đúng chủ (dùng lại `port_owner` của T19).
- **Có image nào bee không đoán được kiểu không** — nói tên ra, vì nó nghĩa là
  mọi phiên cần nó sẽ tự dựng riêng.
- **Bao nhiêu lát đang treo vì `needs_human`** — con số này chỉ tăng thì đến
  lúc phải đi xem mấy cái xác.

Biết trước khi xếp việc đêm, không phải sáng hôm sau.

---

## 9. Màn Settings — một trang, hai tab

Chốt 26/08: **gộp làm một trang, chia hai tab.** `/setup` hôm nay đang đóng hai
vai cùng lúc (hướng dẫn cài lần đầu Step 1→5 **và** cấu hình chạy hằng ngày:
repos, env.d, tài khoản Claude, PAUSE, đĩa/gc) mà không nói ra. Hai tab làm
chuyện đó thành tường minh thay vì nhét thêm panel vào một wizard.

```
/setup
├── Tab "Cài đặt lần đầu"    Step 1→5 hiện có: runner · Claude+GitHub ·
│                            repos+branch protection · doctor · gỡ PAUSE
└── Tab "Cấu hình"           pool dịch vụ · env.d theo repo · tài khoản
                             Claude · PAUSE · đĩa & gc · lát đang cấp
```

Tab mặc định: **Cấu hình** khi doctor xanh, **Cài đặt lần đầu** khi doctor đỏ
hoặc chưa chạy lần nào — dùng lại đúng logic `postLoginTarget` đã có.

### Panel · Pool dịch vụ

| tên | image | kiểu bee đoán | cổng | trạng thái |
|---|---|---|---|---|
| postgres | `postgres:16` | **postgres** ✓ | 127.0.0.1:55432 | up · 180MB |
| rabbitmq | `rabbitmq:3-management` | **rabbitmq** ✓ | :55672 | up · 96MB |
| storage | `mycompany/blob:2` | **không nhận ra** ⚠ | :59000 | up |

- `+ Thêm service` · sửa · xoá → ghi `services/compose.yml` (tmp+rename) →
  nút `Restart pool`
- Ô sửa `services/admin.env` (600), giá trị che, chỉ ghi đè
- **Dòng ⚠ là bắt buộc**, kèm câu giải thích hệ quả: *"bee không nhận ra image
  này, nên mọi phiên cần nó sẽ tự dựng bản riêng thay vì dùng chung."*

### Panel · Lát đang cấp

Mỗi phiên một dòng: `uuid8 · repo#num · db/vhost/bucket · dung lượng ·
trạng thái phiên · lý do giữ`. Cùng khuôn `DiskPanel` đang đọc `gc.json`.
Nút *Thu hồi ngay* — chỉ bật cho phiên đã kết thúc.

### Panel · Dịch vụ của phiên (trong màn phiên, cạnh nút Stop)

Chốt 26/08. Màn Settings trả lời *"máy đang có gì"*; nhưng lúc đang xem một
phiên chạy, câu hỏi là *"**phiên NÀY** đang nối vào đâu"* — và hai câu đó
không trả lời thay nhau được.

Nút nằm ở dải đầu phiên, **bên trái nút Stop**, nhãn là số dịch vụ đang có
(vd. `⛁ 3`). Bấm mở một Sheet:

| dịch vụ | kiểu | nối vào | trạng thái |
|---|---|---|---|
| postgres | postgres | **pool** · `bee_a3f2c1d0` | up · 12MB |
| rabbitmq | rabbitmq | **pool** · vhost `/bee_a3f2c1d0` | up |
| redis | redis | **riêng phiên** · `bee-a3f2c1d0` | up · cổng 54003 |
| storage | không đoán được | **riêng phiên** ⚠ | chưa dựng |

Ba điều Sheet này phải nói, vì không màn nào khác nói được:

1. **Cái nào là lát của pool, cái nào là container riêng của phiên.** Đây là
   khác biệt đắt nhất trong cả thiết kế: một cái mất đi khi gc chạy, cái kia
   ảnh hưởng tới mọi phiên.
2. **Cái nào bee không đoán được kiểu** — cùng cảnh báo ⚠ như §9, nhưng ở
   đúng lúc người dùng đang nhìn phiên đó chạy.
3. **Tên lát và cổng thật**, copy được — để dán vào `psql`/`redis-cli` khi cần
   soi tay.

Nguồn dữ liệu: `sessions/<id>/services.json` (bee ghi lúc mốc 5) ghép với
`docker compose -p bee-<uuid8> ps` cho phần container. Phiên **không có** dịch
vụ nào thì **không hiện nút** — một nút mở ra bảng trống là nhiễu.

### Kỷ luật không được bỏ

Ô nhập image và tên service là **chỗ dễ chèn lệnh nhất trên cả app**. Mọi giá
trị đi vào compose hay argv phải qua **allowlist regex TRƯỚC**, đúng kỷ luật đã
có ở `machine-ctl` (slug, repo, tên unit):

```
tên service   ^[a-z0-9][a-z0-9_-]{0,30}$
image         ^[a-z0-9._/-]+(:[A-Za-z0-9._-]+)?$
cổng          số nguyên 1024–65535
```

Thất bại là **dữ liệu trả về**, không phải exception ném lên UI.

---

## 10. Chia đợt

| Đợt | Gồm | Vì sao tách |
|---|---|---|
| **T15a** | `gc.sh` biết `docker compose down -v` | Vá nợ đã có (§7), không phụ thuộc gì phía sau |
| **T15b** | `service-slices.sh` (cấp/thu hồi) + bảng tra image + mở rộng `env.d` + rig | Lõi. Chạy được bằng tay trước khi có UI |
| **T15c** | Hai tab `/setup` + panel pool + panel lát + **panel dịch vụ trong màn phiên** + doctor `dich-vu` | UI, sau khi lõi đã đúng |
| **T17** | Trả `native.cgroupdriver=systemd` | **Chỉ khi** muốn đặt trần `--memory`/`--cpus` cho từng phiên. Với thiết kế này (lát chung, container per-phiên nhỏ) thì chưa cần — xem [docker-cho-bee.md §5b](../docker-cho-bee.md) |

---

## 11. Rủi ro đã biết, ghi ra để không phải phát hiện lại

- **Đoán trượt image im lặng** → §3 mặc định nghiêng về "dựng riêng", §7 doctor
  và §9 màn Settings đều phải nói ra.
- **`num` trùng khi mở hai phiên cùng lúc** → §4 đặt tên theo uuid, cắt hẳn.
- **Pool là điểm chết chung.** Pool sập thì mọi phiên của repo cần nó không mở
  được. Đó là đánh đổi có ý thức của việc dùng chung (nếu mỗi phiên tự dựng
  stack thì ba phiên đêm = ~5GB RAM). Bù lại bằng: `restart: unless-stopped`,
  doctor kiểm hằng ngày, và phiên từ chối **ồn ào** thay vì chết giữa chừng.
- **`gc.sh` chạy không người, nay cầm thêm admin credential.** Mọi lệnh drop
  phải là tên **suy ra từ uuid**, không bao giờ ghép từ dữ liệu ngoài luồng
  (tên trong `services.json` phải khớp regex trước khi vào argv).
- **Chung kernel với `ducba`** — rootless không sửa được, chỉ VM/LXC cắt. Xem
  [docker-cho-bee.md §7](../docker-cho-bee.md).
