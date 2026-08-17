---
name: bee-update-pr
description: Đẩy commit mới lên PR đang mở của phiên bee và comment tóm tắt thay đổi. Dùng sau khi sửa theo góp ý hoặc làm tiếp trên một PR đã mở.
---

# bee-update-pr

Cập nhật PR đang mở: push commit mới + một comment nói rõ đã đổi gì.

## Cách làm

1. Kiểm branch như `bee-push-pr` (chỉ `bee/*`).
2. `git push` — PR trên cùng branch tự cập nhật.
3. Comment tóm tắt, để người review không phải đọc lại cả diff:

```bash
gh pr comment --body-file - <<'BODY'
Đã cập nhật: <một-hai câu — đổi gì, vì sao, test nào xanh>
BODY
```

## Không bao giờ

- `--force` đè lịch sử người khác đã review, trừ khi chính mình vừa rebase và nói rõ trong comment.
