# Deploy — đưa repo lên chính con máy bee

> Một lệnh, chạy lại bao nhiêu lần cũng được:
>
> ```bash
> apps/runner/bin/deploy.sh
> ```

> Đó là cho máy **đang chạy rồi**. Máy trắng (chưa có node, chưa có docker)
> thì chạy [`bootstrap.sh`](../apps/runner/bin/bootstrap.sh) một lần trước —
> nó cài công cụ rồi gọi chính `deploy.sh` này. Xem
> [tach-user.md bước 5](tach-user.md).

## 1. Nó làm gì, theo thứ tự

| # | Bước | Vì sao |
|---|---|---|
| 0 | Dò `PREFIX` + `BEE_ROOT` **từ chính unit đang chạy** | Máy này cài vào `~/.local/bee` + `~/.local/srv/bee`, không phải `/opt/bee` + `/srv/bee` như mặc định. Script đoán sai đường dẫn còn tệ hơn không có script |
| 1 | Bốn cổng: `lint · typecheck · vitest · bash -n` | Deploy là lúc cuối cùng còn rẻ để phát hiện. `--fast` bỏ qua khi đang chữa cháy |
| 2 | `pnpm build` | Bản standalone; build tự chép `.next/static` + `public` vào — thiếu bước này thì web lên mạng **không CSS** (đã xảy ra 19/08) |
| 3 | `install.sh` (idempotent) | **Bước hay bị quên nhất.** `session-run.sh` chạy từ bản ĐÃ CÀI ở `$PREFIX/bin`, không phải từ repo. Sửa runner mà chỉ restart web thì thay đổi không bao giờ tới phiên |
| 4 | `systemctl --user restart bee-web` rồi **chờ nó thật sự trả lời** | "Đã restart" ≠ "đang chạy". Script poll `127.0.0.1:$PORT` tối đa 30s; `307` (đá về `/login`) tính là khoẻ vì auth đang gác đúng |
| 5 | `bee-doctor.service` + tóm tắt | Deploy xong mà checklist A+ đỏ thì phải biết ngay, không phải sáng hôm sau |

Kết thúc in: nhánh + commit, prefix runner, cổng web, trạng thái ba unit, và
`tailscale serve status` nếu có.

## 2. Các cờ

| Cờ | Khi nào dùng |
|---|---|
| *(không có)* | Mặc định — đủ cổng, đủ runner, đủ web |
| `--fast` | Bỏ lint/typecheck/test. Vẫn build. Dùng khi đang vá gấp và đã tự chạy cổng rồi |
| `--e2e` | Chạy thêm Playwright trước khi deploy (chậm hơn ~20s, cần build riêng) |
| `--web-only` | Chỉ build lại web + restart. Dùng khi **chắc chắn** không đụng gì trong `apps/runner/` |

Ghi đè đường dẫn khi cần: `BEE_PREFIX=... BEE_ROOT=... apps/runner/bin/deploy.sh`.

## 3. Hỏng thì làm gì

**Web không trả lời sau 30s** — script thoát khác 0 và in sẵn lệnh:

```bash
journalctl --user -u bee-web -n 50 --no-pager
```

Thường là một trong ba: build lỗi (bước 2 đã phải đỏ trước đó), `web.env`
thiếu biến bắt buộc, hoặc cổng đang bị chiếm.

**Quay về bản trước** — bản chạy là bản trong worktree, nên rollback là một
lần checkout rồi deploy lại:

```bash
git checkout <commit-cũ> && apps/runner/bin/deploy.sh --fast
```

**Phiên đang chạy có bị ảnh hưởng không?** Không. Phiên sống dưới
`bee-session@<id>`, không dưới web — restart web không đụng tới chúng
(bất biến số 2 của kiến trúc). Nhưng `install.sh` ghi đè `$PREFIX/bin`, nên
phiên đang chạy vẫn dùng bản script cũ đã nạp; phiên MỚI mới nhận bản mới.

## 4. Sau khi deploy, nhìn gì

```bash
systemctl --user status bee-web --no-pager        # web
systemctl --user list-timers 'bee-*'              # reaper + heartbeat còn sống?
cat $BEE_ROOT/doctor.json | jq '.ok, .checks[] | select(.ok|not)'
```

Trên trình duyệt: `/setup` hiện doctor đầy đủ, `/projects` là bảng issue,
`/sessions` là danh sách phiên.

## 5. Cái script này KHÔNG làm

- Không migrate dữ liệu — `$BEE_ROOT` là trạng thái sống, script chỉ đọc `web.env`.
- Không đụng `web.env`: secret nằm ở đó và không bao giờ đi vào repo.
- Không tự `git pull` / `git push`: deploy là "đưa **bản đang có trong worktree**
  lên máy", cố ý — để deploy được bản chưa commit khi cần thử.
- Không dừng phiên đang chạy.
