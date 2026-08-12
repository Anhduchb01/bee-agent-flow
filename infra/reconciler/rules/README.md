# Rules

Mỗi file là một rule. `reconcile.sh` nạp chúng theo thứ tự tên file — **thứ tự tên
file chính là thứ tự ưu tiên**, và thứ tự đó mã hoá một chính sách: *gỡ chặn người
trước, nhận việc mới sau*.

Mỗi file phải khai báo:

| Biến / hàm | Nghĩa |
|---|---|
| `RULE_ID` | tên hiển thị, ví dụ `07-build` |
| `RULE_POOL` | `build` hoặc `evidence` — quyết định lấy slot từ bể nào |
| `RULE_AGENT` | `1` nếu rule này gọi model, `0` nếu là bash thuần |
| `rule_scan <slug>` | in ra ứng viên, mỗi dòng: `<số><TAB><ưu tiên 0|1><TAB><tiêu đề>` |
| `rule_run <slug> <số>` | thực thi (chạy trong worker, không chạy trong reconciler) |

`rule_scan` **phải chỉ đọc** và phải nhanh — nó chạy mỗi 30 giây cho mọi repo.
Mọi việc dài nằm ở `rule_run`, và `rule_run` chỉ được gọi bên trong
`bee-task@<slug>-<số>.service`.

Ứng viên có `ưu tiên = 1` (label `priority:high`) luôn xếp trước. Trong cùng mức
ưu tiên, `reconcile.sh` sắp theo **số slot repo đó đang chiếm** rồi mới tới số
issue — đó là toàn bộ cơ chế công bằng giữa các repo.
