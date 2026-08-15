#!/usr/bin/env bash
#
# agent-exec.sh — CHẠY DƯỚI bee-agent. Đây là tiến trình duy nhất gọi model.
#
#   agent-exec.sh <worktree> <prompt-file> <log-file> [session-id]
#
# Nó KHÔNG có GH_TOKEN, KHÔNG có sudo, KHÔNG thuộc group docker.
# Đó không phải quy ước mà là ranh giới UID — kernel chặn, không phải prompt chặn.
#
# Sudoers chỉ cho phép orch chạy đúng file này, không cho chạy gì khác:
#   bee-orch ALL=(bee-agent) NOPASSWD: /opt/bee/bin/agent-exec.sh

set -euo pipefail

WORKTREE="${1:?cần worktree}"
PROMPT="${2:?cần prompt file}"
LOG="${3:?cần log file}"
RESUME="${4:-}"

MAX_TURNS="${MAX_TURNS:-80}"
AGENT_TIMEOUT="${AGENT_TIMEOUT:-30m}"

[[ -d "$WORKTREE" ]] || { echo "agent-exec: không có worktree $WORKTREE" >&2; exit 2; }
[[ -r "$PROMPT"   ]] || { echo "agent-exec: không đọc được prompt $PROMPT" >&2; exit 2; }

command -v claude >/dev/null 2>&1 || {
  echo "agent-exec: chưa cài claude, hoặc chưa đăng nhập dưới user này" >&2; exit 2; }

# Token dài hạn, nếu có. File là 0640 root:bee-agent — bee-orch KHÔNG đọc được,
# và việc nạp nó xảy ra ở đây, SAU khi sudo đã đổi sang bee-agent.
#
# Đó là điểm mấu chốt: nếu worker.sh (chạy dưới bee-orch) nạp file này rồi
# truyền xuống qua môi trường thì orch đã cầm credential Claude, và ranh giới
# hai UID mất đúng nửa ý nghĩa của nó. sudo dọn sạch môi trường trước khi chạy
# file này, nên đây là chỗ duy nhất token đi vào tiến trình.
#
# `set -a` để nó được EXPORT sang `claude` — biến của shell thì tiến trình con
# không thấy. (Cùng lỗi từng làm `be doctor` báo sai về GH_TOKEN.)
if [[ -r /etc/bee/agent.env ]]; then
  set -a
  # shellcheck source=/dev/null
  source /etc/bee/agent.env
  set +a
fi

cd "$WORKTREE"

# Ba chốt chặn: timeout bash · TimeoutStartSec ở systemd · --max-turns.
# Với gói thuê bao thì chi phí không đo được bằng tiền — theo dõi bằng turn và
# thời lượng, hai thứ đều nằm trong dòng "result" của stream-json.
exec timeout "$AGENT_TIMEOUT" \
  claude -p "$(cat "$PROMPT")" \
    --output-format stream-json --verbose \
    --dangerously-skip-permissions \
    --max-turns "$MAX_TURNS" \
    ${RESUME:+--resume "$RESUME"} \
  > >(tee -a "$LOG") 2>&1
