#!/usr/bin/env bash
#
# reconcile.sh — DISPATCHER. Chạy mỗi 30 giây, LUÔN kết thúc dưới 5 giây.
#
# Nó nhìn trạng thái, chọn đúng MỘT việc, giao cho một systemd unit riêng,
# rồi thoát. Nó không bao giờ tự chạy việc dài — nếu tick nào vượt
# TimeoutStartSec=120 thì systemd giết nó, và đó là bẫy cố ý để bug lộ ngay.
#
#   reconcile.sh            chạy thật
#   reconcile.sh --dry-run  chỉ in ra sẽ làm gì (mốc M0)

set -euo pipefail

LIB="${BEE_PREFIX:-/opt/bee}/lib"
# shellcheck source=../lib/common.sh
source "$LIB/common.sh"
# shellcheck source=../lib/config.sh
source "$LIB/config.sh"
# shellcheck source=../lib/github.sh
source "$LIB/github.sh"
# shellcheck source=../lib/state.sh
source "$LIB/state.sh"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1
[[ "${BEE_DRY_RUN:-0}" == "1" ]] && DRY_RUN=1

need jq; need gh; need systemctl
load_global_config

# ---------------------------------------------------------------------------
# Rule 0 — kill switch. Không có gì trước nó.
# ---------------------------------------------------------------------------
if [[ -f "$BEE_ETC/PAUSE" ]]; then
  # Dry-run KHÔNG được ghi gì. Mốc M0 tồn tại để bạn tin cái vòng lặp, và một
  # lệnh "xem thử" mà đóng dấu heartbeat sẽ làm hệ thống trông như đang sống
  # trong khi timer chưa hề chạy — đúng thứ heartbeat sinh ra để phát hiện.
  if (( DRY_RUN )); then
    printf '%s[DRY]%s đang tạm dừng (/etc/bee/PAUSE) — sẽ không làm gì\n' "$C_DIM" "$C_RESET"
    exit 0
  fi
  heartbeat_write
  status_write "paused"
  exit 0
fi

# ---------------------------------------------------------------------------
# Slot
# ---------------------------------------------------------------------------
BUILD_USED=$(running_in_pool build)
EVID_USED=$(running_in_pool evidence)

pool_has_slot() {
  case "$1" in
    build)    (( BUILD_USED < MAX_BUILD_SLOTS )) ;;
    evidence) (( EVID_USED  < MAX_EVIDENCE_SLOTS )) ;;
    *) return 1 ;;
  esac
}

# Lý do chờ, hiển thị trên dashboard. Đây là trường có giá trị cao nhất khi
# lên nhiều repo: nó biến "sao task của tôi chưa chạy?" từ một câu hỏi hỗ trợ
# thành một câu trả lời tự phục vụ.
wait_reason() {
  local pool="$1" slug="$2"
  if ! pool_has_slot "$pool"; then
    case "$pool" in
      build)    printf 'chờ slot build · toàn cục %d/%d' "$BUILD_USED" "$MAX_BUILD_SLOTS" ;;
      evidence) printf 'chờ slot evidence · toàn cục %d/%d' "$EVID_USED" "$MAX_EVIDENCE_SLOTS" ;;
    esac
  elif (( $(running_in_repo "$slug") >= MAX_PER_REPO )); then
    printf 'repo đã dùng %d/%d slot' "$(running_in_repo "$slug")" "$MAX_PER_REPO"
  else
    printf 'xếp sau task khác'
  fi
}

# ---------------------------------------------------------------------------
# Quét: rule TRƯỚC, repo SAU.
#
# Chính sách "gỡ chặn người trước, việc mới sau" là chính sách về thời gian của
# CON NGƯỜI, không phải về repo — một Techlead đang chờ ở repo B không nên xếp
# hàng sau đống task mới của repo A.
# ---------------------------------------------------------------------------
CANDIDATES=()          # sortkey \t rule_file \t pool \t slug \t num \t label
QUEUE_JSON=()

scan_all() {
  local rf slug num prio label

  shopt -s nullglob
  for rf in "$BEE_PREFIX"/rules/[0-9][0-9]-*.sh; do
    ( source "$rf" ) >/dev/null 2>&1 \
      || { warn "rule lỗi cú pháp, bỏ qua: $rf"; continue; }

    for slug in $(enabled_repos); do
      (
        set +e
        # shellcheck source=/dev/null
        source "$rf"
        load_repo_config "$slug"

        # Kill switch phía repo — PM tạo .agent/PAUSE qua web GitHub trong 10 giây,
        # và nó lưu vết trong lịch sử git: ai dừng, lúc nào, vì sao.
        repo_paused "$REPO_GIT" && exit 0

        rule_scan "$slug" 2>/dev/null | while IFS=$'\t' read -r num prio label; do
          [[ -z "$num" ]] && continue
          printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
                 "$RULE_ID" "$RULE_POOL" "${RULE_INLINE:-0}" \
                 "$prio" "$slug" "$num" "$label"
        done
      )
    done
  done
  shopt -u nullglob
}

# Rule inline (RULE_INLINE=1) chạy thẳng trong reconciler: chúng chỉ là một lời
# gọi API, dựng cả một systemd unit cho việc đó thì quá phí. Đổi lại chúng phải
# THẬT SỰ rẻ — có trần mỗi tick để không bao giờ chạm TimeoutStartSec=120.
INLINE_BUDGET=3
run_inline() {
  local rule="$1" slug="$2" num="$3"
  (( INLINE_BUDGET-- > 0 )) || return 0
  (
    set +e
    # shellcheck source=/dev/null
    source "$BEE_PREFIX/rules/$rule.sh"
    load_repo_config "$slug"
    rule_run "$slug" "$num"
  ) >/dev/null 2>&1
}

# Khoá sắp xếp trong cùng một rule:
#   1. priority:high
#   2. số slot repo đó đang chiếm (tăng dần)  ← toàn bộ cơ chế công bằng
#   3. số issue
# Khoá 2 làm repo đang chiếm 2 slot tự xếp sau repo đang chiếm 0 — tự cân bằng,
# không cần lưu state round-robin, không repo nào bị đói.
rank_line() {
  local rule="$1" prio="$2" slug="$3" num="$4"
  printf '%s|%d|%03d|%08d' "$rule" $(( 1 - prio )) "$(running_in_repo "$slug")" "$num"
}

# ---------------------------------------------------------------------------
main() {
  local line rule pool inline prio slug num label id picked=0
  local -a rows=()

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    IFS=$'\t' read -r rule pool inline prio slug num label <<<"$line"
    rows+=("$(rank_line "$rule" "$prio" "$slug" "$num")"$'\t'"$line")
  done < <(scan_all)

  IFS=$'\n' rows=($(printf '%s\n' "${rows[@]:-}" | sort)); unset IFS

  for line in "${rows[@]:-}"; do
    [[ -z "$line" ]] && continue
    IFS=$'\t' read -r _ rule pool inline prio slug num label <<<"$line"
    id="$slug-$num"

    # Rule inline: chạy ngay, không chiếm slot, không tính là "đã chọn".
    if [[ "$inline" == "1" ]]; then
      if (( DRY_RUN )); then
        printf '%s[DRY]%s inline %s%-22s%s rule=%-18s %s\n' \
               "$C_DIM" "$C_RESET" "$C_BOLD" "$id" "$C_RESET" "$rule" "$label"
      else
        run_inline "$rule" "$slug" "$num"
      fi
      continue
    fi

    # Điều kiện dispatch đầy đủ là BA vế, không phải một: điều kiện của rule ∧
    # pool đích còn slot ∧ item chưa có unit đang chạy. Thiếu vế giữa thì một
    # hàng đợi build đầy sẽ chặn luôn việc chạy bằng chứng — hai việc dùng tài
    # nguyên khác nhau, không có lý do gì chặn nhau.
    if unit_active "$id"; then continue; fi
    if (( picked )) || ! pool_has_slot "$pool" \
       || (( $(running_in_repo "$slug") >= MAX_PER_REPO )); then
      QUEUE_JSON+=("$(jq -nc --arg repo "$slug" --argjson number "$num" --arg rule "$rule" \
                        --arg title "$label" --arg wait "$(wait_reason "$pool" "$slug")" \
                        '{repo:$repo,number:$number,rule:$rule,title:$title,wait_reason:$wait}')")
      continue
    fi

    if (( DRY_RUN )); then
      printf '%s[DRY]%s giao %s%-22s%s rule=%-18s pool=%-8s %s\n' \
             "$C_YELLOW" "$C_RESET" "$C_BOLD" "$id" "$C_RESET" "$rule" "$pool" "$label"
    else
      claim_write "$id" "$slug" "$num" "$rule" "$pool"
      systemctl start --no-block "$(unit_of "$id")"
      info "giao $id · $rule · $label"
    fi
    picked=1                     # MỘT việc mỗi tick, rồi thoát
  done

  (( picked )) || { (( DRY_RUN )) && printf '%s[DRY]%s không có gì để làm\n' "$C_DIM" "$C_RESET"; }

  # Xem `if (( DRY_RUN ))` ở nhánh PAUSE phía trên: dry-run không đóng dấu
  # heartbeat và không ghi đè status.json. Nếu ghi, một lần "xem thử" sẽ dựng ra
  # một ảnh chụp trạng thái mà không tick nào thật sự sinh ra.
  if (( ! DRY_RUN )); then
    heartbeat_write
    status_write "running"
  fi
}

# ---------------------------------------------------------------------------
# status.json — dashboard đọc file này. Nó KHÔNG do reconciler phục vụ:
# file tĩnh + Caddy tách rời hai số phận, nên reconciler chết thì trang vẫn lên
# và heartbeat cũ hiện thành báo động đỏ.
# ---------------------------------------------------------------------------
status_write() {
  local mode="$1" id d out="$BEE_SRV/public/status.json"
  local -a running=() repos=()

  while read -r id; do
    [[ -z "$id" ]] && continue
    d=$(state_dir "$id")
    [[ -f "$d/claim.json" ]] || continue
    running+=("$(jq -c --argjson elapsed_s "$(( $(now_epoch) - $(claim_started_epoch "$id") ))" \
                   '. + {elapsed_s:$elapsed_s}' "$d/claim.json")")
  done < <(running_ids)

  local slug
  for slug in $(enabled_repos); do
    repos+=("$( ( load_repo_config "$slug"
      jq -nc --arg slug "$slug" --arg full "$REPO_FULL" \
             --argjson running "$(running_in_repo "$slug")" \
             --argjson wip_max "$REPO_WIP_MAX" \
             --argjson paused "$(repo_paused "$REPO_GIT" && echo true || echo false)" \
             --argjson queue "$(printf '%s\n' "${QUEUE_JSON[@]:-}" | jq -sc "map(select(.repo==\"$slug\"))")" \
             --argjson recent "$(grep -h "\"repo\":\"$slug\"" "$BEE_SRV/state/recent.jsonl" 2>/dev/null \
                                  | tail -n 5 | jq -sc 'reverse')" \
             '{slug:$slug, full:$full, enabled:true, paused:$paused,
               running:$running, wip:{max:$wip_max},
               queue:$queue, recent:$recent}' ) )")
  done

  mkdir -p "$(dirname "$out")"
  jq -n --arg heartbeat "$(now_iso)" --arg mode "$mode" \
        --argjson build_used "$BUILD_USED"  --argjson build_max "$MAX_BUILD_SLOTS" \
        --argjson evid_used "$EVID_USED"    --argjson evid_max "$MAX_EVIDENCE_SLOTS" \
        --argjson per_repo "$MAX_PER_REPO" \
        --argjson running "$(printf '%s\n' "${running[@]:-}" | jq -sc '.')" \
        --argjson repos "$(printf '%s\n' "${repos[@]:-}" | jq -sc '.')" \
        '{heartbeat:$heartbeat, mode:$mode,
          slots:{build:{used:$build_used,max:$build_max,per_repo_max:$per_repo},
                 evidence:{used:$evid_used,max:$evid_max}},
          running:$running, repos:$repos}' \
    > "$out.tmp" && mv "$out.tmp" "$out"
  chmod 644 "$out"
}

main "$@"
