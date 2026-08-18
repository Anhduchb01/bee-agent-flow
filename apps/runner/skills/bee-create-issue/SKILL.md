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
# URL do `gh issue create` in ra; TITLE là tiêu đề vừa dùng. Ghi bằng jq —
# title có dấu nháy hay ký tự lạ vẫn thành JSON hợp lệ, printf thì không.
if [ -n "${BEE_SESSION_DIR:-}" ] && [ -n "$URL" ]; then
  NUM=$(printf '%s' "$URL" | grep -oE '[0-9]+$' || echo null)
  jq -cn --arg url "$URL" --arg title "$TITLE" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson num "${NUM:-null}" \
    '{type:"bee_artifact", kind:"issue", url:$url, number:$num, ts:$ts, title:$title}' \
    >> "$BEE_SESSION_DIR/run.jsonl"
fi
```

5. Báo lại URL issue cho người dùng trong một câu.

## Không bao giờ

- Tạo issue trên repo khác với remote của worktree.
- Gắn nhãn điều phối (`agent:*`, `status:*`) — mô hình nhãn-hàng-đợi đã bỏ.
