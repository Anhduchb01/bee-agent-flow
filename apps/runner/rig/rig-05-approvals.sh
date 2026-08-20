#!/usr/bin/env bash
# Rig 05 — hook-reply approvals (V2.5b), ONLINE: needs a logged-in claude.
#
# Two unknowns this rig kills before any web code is written:
#   1. Does headless stream-json WITHOUT --dangerously-skip-permissions emit
#      a `control_request` / `can_use_tool` line when the agent wants a tool?
#   2. Does writing a `control_response` (allow / deny) back into stdin
#      actually gate the tool — allow runs it, deny blocks it?
#
# The FIFO is the same plumbing session-run.sh uses, so a green rig here
# means the web can answer approvals through the existing `say` path.
set -uo pipefail

T=$(mktemp -d)
trap 'kill "$CPID" 2>/dev/null; rm -rf "$T"' EXIT
cd "$T" && git init -q . && git commit -q --allow-empty -m init

chay_claude() { # $1=fifo $2=out
  # --permission-prompt-tool stdio: HIDDEN flag (absent from --help, found
  # by probing) — routes permission prompts over the stream as
  # control_request/can_use_tool instead of auto-denying. Without it the
  # model never even attempts the tool (first rig run proved that).
  claude -p --input-format stream-json --output-format stream-json --verbose \
    --include-partial-messages --max-turns 3 \
    --permission-prompt-tool stdio \
    <"$1" >"$2" 2>>"$T/err.log" &
  CPID=$!
}

cho_dong() { # $1=file $2=pattern $3=timeout-s
  for _ in $(seq "$3"); do grep -q "$2" "$1" 2>/dev/null && return 0; sleep 1; done
  return 1
}

noi() { printf '%s\n' "$1" >&3; }

# Lệnh KHÔNG THỂ đoán trước (uuid ngẫu nhiên) — lần rig đầu dùng `echo` và
# model "diễn" luôn output mà chẳng gọi tool. Mồi phải làm tool là bắt buộc.
USER_MSG='{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Use the Bash tool to run exactly: cat /proc/sys/kernel/random/uuid — then report its output verbatim. You cannot know it without running the tool."}]}}'

echo "== 1 · ALLOW: can_use_tool xuất hiện, allow → lệnh chạy thật =="
FIFO="$T/in1"; OUT="$T/out1.jsonl"; mkfifo "$FIFO"
chay_claude "$FIFO" "$OUT"
exec 3<>"$FIFO"
noi "$USER_MSG"

if ! cho_dong "$OUT" '"can_use_tool"' 90; then
  echo "✗ KHÔNG thấy control_request can_use_tool sau 90s — xem $OUT / err.log:"
  tail -5 "$OUT" 2>/dev/null; tail -5 "$T/err.log" 2>/dev/null
  exit 1
fi
REQ=$(grep '"can_use_tool"' "$OUT" | head -1)
echo "  control_request: $(jq -c '{id: .request_id, tool: .request.tool_name}' <<<"$REQ")"
REQ_ID=$(jq -r '.request_id' <<<"$REQ")
INPUT=$(jq -c '.request.input' <<<"$REQ")
noi "{\"type\":\"control_response\",\"response\":{\"subtype\":\"success\",\"request_id\":\"$REQ_ID\",\"response\":{\"behavior\":\"allow\",\"updatedInput\":$INPUT}}}"

if cho_dong "$OUT" '"tool_result"' 90; then
  echo "✓ allow → Bash chạy thật, tool_result về stream"
else
  echo "✗ allow rồi mà không thấy tool_result"; tail -5 "$OUT"; exit 1
fi
cho_dong "$OUT" '"type":"result"' 60 && echo "✓ result đóng lượt sạch"
exec 3>&-; wait "$CPID" 2>/dev/null

echo
echo "== 2 · DENY: từ chối → lệnh KHÔNG chạy, agent nhận lý do =="
FIFO2="$T/in2"; OUT2="$T/out2.jsonl"; mkfifo "$FIFO2"
chay_claude "$FIFO2" "$OUT2"
exec 3<>"$FIFO2"
noi "$USER_MSG"

if ! cho_dong "$OUT2" '"can_use_tool"' 90; then
  echo "✗ không thấy can_use_tool ở case deny"; exit 1
fi
REQ2=$(grep '"can_use_tool"' "$OUT2" | head -1)
REQ2_ID=$(jq -r '.request_id' <<<"$REQ2")
noi "{\"type\":\"control_response\",\"response\":{\"subtype\":\"success\",\"request_id\":\"$REQ2_ID\",\"response\":{\"behavior\":\"deny\",\"message\":\"Owner denied this command from the bee approval card.\"}}}"

cho_dong "$OUT2" '"type":"result"' 120 || { echo "✗ không có result sau deny"; exit 1; }
# result ghi sổ các lần bị từ chối — permission_denials phải KHÔNG rỗng.
if grep '"type":"result"' "$OUT2" | tail -1 | jq -e '.permission_denials | length > 0' >/dev/null; then
  echo "✓ deny → tool không chạy, result ghi nhận permission_denials"
else
  echo "✗ deny nhưng result không ghi nhận từ chối"; tail -3 "$OUT2"; exit 1
fi
exec 3>&-; wait "$CPID" 2>/dev/null

echo
echo "RIG-05: TẤT CẢ XANH — hook-reply approvals đứng vững, đủ nền cho mode Manual"
