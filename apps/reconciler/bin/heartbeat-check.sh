#!/usr/bin/env bash
#
# heartbeat-check.sh — bắt chế độ hỏng nguy hiểm nhất: reconciler chết im lặng.
#
# Với GitHub Actions bạn thấy job đỏ. Ở đây, khi reconciler chết thì chỉ đơn giản
# là KHÔNG CÓ GÌ XẢY RA — không lỗi, không thông báo, không dấu hiệu. Đây là
# thứ duy nhất phát hiện được nó.
#
# Nếu tồn tại /etc/bee/alert.sh thì script đó được gọi với một dòng mô tả.
# Cắm Telegram, Slack, email hay gì tuỳ bạn — hệ thống không cần biết.

set -euo pipefail

LIB="${BEE_PREFIX:-/opt/bee}/lib"
source "$LIB/common.sh"; source "$LIB/config.sh"; source "$LIB/state.sh"

load_global_config

alert() {
  local msg="$1"
  logger -t bee -p daemon.warning -- "$msg" 2>/dev/null || true
  printf '%s\n' "$msg" >&2
  [[ -x "$BEE_ETC/alert.sh" ]] && "$BEE_ETC/alert.sh" "$msg" || true
}

# Đang tạm dừng thì im lặng là đúng — đừng bắn cảnh báo cho việc mình tự tắt.
[[ -f "$BEE_ETC/PAUSE" ]] && exit 0

age=$(heartbeat_age_s)
if (( age > HEARTBEAT_STALE_S )); then
  alert "bee: heartbeat cũ $(human_dur "$age") — reconciler có thể đã chết. Kiểm: systemctl status bee-reconcile.timer"
fi

# Unit failed còn sót lại nghĩa là task chết mà chưa ai dọn. Rule 01 sẽ xử lý
# ở tick sau, nhưng nếu nó tồn tại lâu thì chính rule 01 cũng đang hỏng.
failed=$(systemctl list-units --state=failed --no-legend --plain 'bee-task@*.service' 2>/dev/null | wc -l)
if (( failed > 0 )); then
  alert "bee: có $failed task ở trạng thái failed — systemctl reset-failed 'bee-task@*' sau khi xem log"
fi

exit 0
