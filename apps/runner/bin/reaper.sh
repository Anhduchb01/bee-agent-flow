#!/usr/bin/env bash
# reaper.sh — hậu duệ trực tiếp của rule 01: dọn xác phiên.
#
# Điều kiện phát hiện là đĩa + systemd, không phải nhãn GitHub:
#   meta.json nói "running"  ∧  unit không active  →  cái xác.
# Đóng sổ failed, tăng attempt, needs_human từ lần 2, dọn FIFO mồ côi.
# LUÔN ghi heartbeat.json ở cuối — reaper chính là tiến trình nền mà cái
# chết im lặng của nó phải bị web nhìn thấy qua tuổi của file này.
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/../lib/common.sh"

don=0
song=0

for meta in "$BEE_ROOT"/sessions/*/meta.json; do
  [[ -f "$meta" ]] || continue
  status=$(jq -r '.status // empty' "$meta")
  [[ "$status" == "running" ]] || continue

  sdir=$(dirname "$meta")
  id=$(basename "$sdir")

  # Trần byte cho run.jsonl (spec §11) — cắt ngay trong lúc phiên còn chạy,
  # vì đợi tới lúc kết thúc thì đĩa đã đầy rồi.
  "$(dirname "$(readlink -f "$0")")/cat-log.sh" "$id" 2>/dev/null || true

  # ── Trần chi cho MỘT phiên (FR-3.4) ────────────────────────────────────
  # Phanh hạn mức (T5) chỉ chặn MỞ phiên; nó không cứu được phiên đang chạy
  # đốt tiền cả tiếng lúc 2 giờ sáng. `total_cost_usd` trong dòng `result`
  # CỘNG DỒN theo phiên (đo trên máy: 1.02 → 3.50 → … → 5.60), nên dòng cuối
  # là tổng đang đốt. Không cấu hình trần = không phanh ai: mặc định an toàn.
  tran="${SESSION_MAX_USD:-0}"
  if [[ "$tran" != "0" ]] && [[ -f "$sdir/run.jsonl" ]]; then
    da_dot=$(jq -r 'select(.type=="result") | .total_cost_usd // empty' "$sdir/run.jsonl" 2>/dev/null | tail -1)
    if [[ -n "$da_dot" ]] && awk -v a="$da_dot" -v b="$tran" 'BEGIN{exit !(a>b)}'; then
      # Ghi sổ TRƯỚC khi dừng: trap của phiên sẽ ghi status=stopped ngay sau,
      # và meta_merge trộn nên hai bên không xoá nhau. Ngược thứ tự thì người
      # dùng thấy "đã dừng" mà không bao giờ biết vì sao.
      lifecycle "$sdir" "Phiên đã đốt \$$da_dot, vượt trần \$$tran USD — dừng và cần người xem."
      meta_merge "$sdir" "$(jq -cn --arg r "vượt trần chi \$$tran USD"         '{needs_human:true, reason:$r}')"
      systemctl --user stop "bee-session@$id" 2>/dev/null || true
      don=$((don + 1))
      continue
    fi
  fi

  # ── IDLE ceiling for ONE session ───────────────────────────────────────
  # Measured from the LAST thing that happened, not the first. The unit's
  # RuntimeMaxSec cannot do this job: it counts wall time since the unit went
  # active and has no way to know whether the two sides are still talking — so
  # at the old 6h it killed sessions for WAITING. A question asked at midnight
  # was always dead before anyone woke up.
  #
  # run.jsonl is the ledger of BOTH directions: claude's stream, what the
  # person typed (the `say` server action appends it), and `bee_approval` when
  # they press allow. No new line in 24h means nobody is here any more. mtime
  # is the right signal because claude's own lines carry no `ts` to read.
  #
  # Only a LIVE unit: a corpse belongs to the reap branch below, and labelling
  # it "silent too long" would misreport what actually happened.
  idle_h="${SESSION_IDLE_H:-24}"
  if [[ "$idle_h" != "0" ]] && [[ -f "$sdir/run.jsonl" ]]; then
    last_at=$(stat -c %Y "$sdir/run.jsonl" 2>/dev/null || echo 0)
    silent=$(( $(date -u +%s) - last_at ))
    if (( last_at > 0 && silent > idle_h * 3600 )) \
       && systemctl --user is-active --quiet "bee-session@$id" 2>/dev/null; then
      # Written BEFORE the stop, for the same reason as the spend-cap branch:
      # the session's trap writes status=stopped right after, and meta_merge
      # merges rather than overwrites, so neither erases the other.
      lifecycle "$sdir" "Idle $(( silent / 3600 ))h (idle ceiling ${idle_h}h) — stopped to hand back the worktree, RAM and ports. Continue picks up this same conversation."
      meta_merge "$sdir" "$(jq -cn --arg r "idle over ${idle_h}h" '{reason:$r}')"
      systemctl --user stop "bee-session@$id" 2>/dev/null || true
      don=$((don + 1))
      continue
    fi
  fi

  # Transitional states are ALIVE: during `systemctl stop` the unit reads
  # "deactivating" while the trap is still closing the books — reaping at
  # that moment steals a clean stop and mislabels it failed/attempt+1.
  # Only a settled inactive/failed unit is a corpse.
  state=$(systemctl --user is-active "bee-session@$id" 2>/dev/null || true)
  case "$state" in
    active|activating|deactivating|reloading)
      song=$((song + 1))
      continue
      ;;
  esac

  # Xác. Đóng sổ trong đúng một tick — không cần ai nhớ hộ chuyện gì đã xảy ra.
  attempt=$(( $(jq -r '.attempt // 0' "$meta") + 1 ))
  needs_human_flag=false
  (( attempt >= 2 )) && needs_human_flag=true

  meta_merge "$sdir" "$(jq -cn \
    --argjson a "$attempt" --argjson n "$needs_human_flag" --arg t "$(now_iso)" \
    '{status:"failed", reason:"reaped", attempt:$a, needs_human:$n, ended_at:$t}')"
  lifecycle "$sdir" "Phiên chết ngoài ý muốn — reaper đóng sổ (lần $attempt)."
  rm -f "$BEE_RUNTIME/$id.in"
  don=$((don + 1))
done

mkdir -p "$BEE_ROOT"
jq -cn --arg t "$(now_iso)" --argjson s "$song" --argjson d "$don" \
  '{ts:$t, sessions_running:$s, reaped:$d}' > "$BEE_ROOT/heartbeat.json"
