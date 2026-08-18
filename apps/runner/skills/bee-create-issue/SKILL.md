---
name: bee-create-issue
description: Tạo GitHub issue cho hợp đồng task vừa chốt trong phiên bee. Dùng khi người dùng đã đồng ý hợp đồng ("ok làm đi") và task chưa có issue — issue là nơi kết quả rơi xuống, không phải hàng đợi.
---

# bee-create-issue

Tạo issue ghi lại hợp đồng task. Chạy `gh` trực tiếp — token là fine-grained
PAT phạm vi hẹp, hàng rào thật nằm ở phạm vi PAT và branch protection.

## Cách làm

1. Xác định repo: đọc remote của worktree hiện tại — `git remote get-url origin`.
   **Chỉ được tạo issue trên đúng repo này.**
2. Soạn nội dung từ hợp đồng đã chốt trong hội thoại: tiêu đề một dòng,
   thân gồm bối cảnh + tiêu chí nghiệm thu (checkbox) + ràng buộc.
3. Tạo, dùng body qua stdin để không lộ nội dung vào argv:

```bash
gh issue create --title "<tiêu đề>" --body-file - <<'BODY'
<thân issue>
BODY
```

4. **Ghi sổ cho canvas** — chỉ khi đang chạy trong một phiên bee
   (`BEE_SESSION_DIR` tồn tại; chạy ngoài phiên thì bỏ qua, đừng nổ):

```bash
URL=$(gh issue view --json url --jq .url 2>/dev/null || true)  # hoặc URL từ bước tạo
NUM=$(gh issue view --json number --jq .number 2>/dev/null || echo null)
if [ -n "${BEE_SESSION_DIR:-}" ] && [ -n "$URL" ]; then
  printf '{"type":"bee_artifact","kind":"issue","url":"%s","number":%s,"ts":"%s"}\n' \
    "$URL" "$NUM" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$BEE_SESSION_DIR/run.jsonl"
fi
```

5. Báo lại URL issue cho người dùng trong một câu.

## Không bao giờ

- Tạo issue trên repo khác với remote của worktree.
- Gắn nhãn điều phối (`agent:*`, `status:*`) — mô hình nhãn-hàng-đợi đã bỏ.
