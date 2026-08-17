---
name: bee-push-pr
description: Push branch của phiên bee và mở draft pull request. Dùng khi đã có commit đáng cho người xem — kết quả phải rơi xuống GitHub dưới dạng PR, không bao giờ push thẳng main.
---

# bee-push-pr

Push branch hiện tại và mở draft PR. `main` có branch protection nên push
thẳng sẽ bị GitHub từ chối — đường duy nhất vào main là nút merge của người.

## Cách làm

1. **Kiểm branch trước — bắt buộc.** Từ chối nếu branch hiện tại không bắt
   đầu bằng `bee/`:

```bash
BR=$(git branch --show-current)
case "$BR" in bee/*) ;; *) echo "TỪ CHỐI: đang ở '$BR', chỉ push branch bee/*"; exit 1;; esac
```

2. Đảm bảo mọi thay đổi định đưa lên đã được commit. **Không** `git add -A`
   mù quáng — kiểm `git status` xem có file lạ (`.env*`, credential) không.
3. Push và mở draft PR:

```bash
git push -u origin "$BR"
gh pr create --draft --title "<tiêu đề>" --body-file - <<'BODY'
## Tóm tắt
<đã đổi gì và vì sao — người đọc trong 20 giây phải hiểu>

## Kiểm chứng
<đã chạy test gì, kết quả>

Closes #<số issue nếu có>
BODY
```

4. Báo lại URL PR trong một câu.

## Không bao giờ

- Push branch không phải `bee/*`. Không `--force` trừ khi chính mình vừa rebase branch này.
- Merge PR — merge là của người, luôn luôn.
