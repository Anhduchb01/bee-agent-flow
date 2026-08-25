# Nhiều tài khoản Claude trên bee

*Viết 25/08/2026 — cùng ngày tách user.*

Bee chạy phiên bằng **một** tài khoản Claude tại một thời điểm. Muốn giữ vài
tài khoản và đổi qua lại (tài khoản công ty ban ngày, tài khoản cá nhân cho
phiên đêm chẳng hạn) thì dùng `token-slayer` — công cụ quản lý slot của
ownego. Bảng điều khiển nằm ở `/setup`, mục **Tài khoản Claude trên máy**.

## 1 · Nó lưu ở đâu, và vì sao điều đó quan trọng

```
~/.config/token_slayer/accounts/<email>.json   credential của từng slot
~/.config/token_slayer/state.json              slot nào đang bật
~/.claude/.credentials.json                    ← slayer GHI ĐÈ file này
```

Dòng cuối là điểm mấu chốt: `claude` chỉ biết đúng một file credential, nên
**đổi tài khoản là đổi cho cả máy**, không phải cho một phiên. Hai hệ quả
được ép thành luật trong code, không để người dùng tự nhớ:

- **Còn phiên đang chạy thì `/setup` từ chối đổi.** Phiên đang chạy sẽ trôi
  sang tài khoản mới lúc nó làm mới token — hỏng kiểu đó không ai lần ra
  được. Muốn đổi thì dừng phiên trước.
- **`claude.env` đè lên tất cả.** Runner `export CLAUDE_CODE_OAUTH_TOKEN` từ
  file đó, mà biến môi trường thắng file credential. Còn nó thì bấm đổi tài
  khoản *thấy* đổi nhưng phiên vẫn chạy token cũ. `/setup` phát hiện và cho
  nút gỡ; `doctor` cũng nói ra trong mục `claude`.

## 2 · Đường đi thường gặp

| Muốn gì | Bấm gì |
|---|---|
| Cài lần đầu | Dán `TOKEN_SLAYER_TOKEN` vào ô ở `/setup` |
| Lưu tài khoản đang đăng nhập thành slot | Nhập tên → **Lưu tài khoản đang đăng nhập** (`tok add <tên>`) |
| Thêm tài khoản khác | Nhập tên → **Đăng nhập tài khoản khác** → mở link → dán mã (`tok add <tên> --login`) |
| Đổi | **Dùng cái này** ở hàng tương ứng (`tok switch <tên>`) |

Token cài đặt đi qua **biến môi trường**, không qua argv — argv thì mọi
tiến trình cùng user đọc được. URL trình cài đặt ghim cứng trong mã: một
biến để đổi host sẽ biến ô dán token thành ô chạy mã tuỳ ý.

## 3 · Cái bẫy pty (đã trả giá một buổi chiều)

`tok add --login` và `claude setup-token` cùng đòi terminal thật, nên web
lái chúng qua `script`. Ba thứ phải đúng, sai cái nào cũng ra **cùng một
triệu chứng**: mã nằm trong ô, không có gì xảy ra.

1. `stty cols 400` trước khi chạy — pty mặc định 80 cột, UI ngắt cứng theo
   bề ngang, URL bị chặt đôi và token (125 ký tự) bị lưu mất nửa sau *im
   lặng*.
2. Enter là `\r`, không phải `\n`.
3. `\r` phải đến trong **cụm riêng**: cụm quá ~56 byte bị đọc là "dán", mà
   dán thì `\r` dính đuôi chỉ là ký tự. Mã xác nhận thật dài ~70 ký tự nên
   luôn vượt ngưỡng này — đây chính là chỗ bản vá đầu tiên trượt.

Cả ba khoá lại ở `claude-setup-flow.test.ts` và `slayer-flow.test.ts` bằng
một `claude`/`tok` giả có bật raw mode và nhận diện dán theo cụm thời gian.
Gỡ bất kỳ miếng vá nào → test đỏ.

## 4 · Hook của token-slayer

Trình cài đặt gắn hook vào `~/.claude/settings.json` (SessionStart,
UserPromptSubmit, PreToolUse…). Mặc định chúng gửi **prompt text và
`tool_input`** lên `token-slayer.ownego.com` — với bee thì `tool_input` là
nội dung file trong repo riêng. Đặt `SLAYER_MINIMAL_PAYLOAD=1` thì chỉ còn
usage + attribution. Đây là công cụ của công ty bạn nên đó là lựa chọn của
bạn, nhưng nó phải là **lựa chọn**, không phải thứ tình cờ.

**Đã bật trên máy này (25/08)**, đặt ở `$BEE_ROOT/machine.env` — tầng env của
máy mà mọi phiên đều nạp. Nạp **trước** `claude.env` nên một dòng ở đây không
bao giờ thay được token của cả máy; rig-13 khoá đúng thứ tự đó.
