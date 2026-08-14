#!/usr/bin/env bash
# evidence.sh — bằng chứng E2E sống trên đĩa của orch, không trên MinIO.
#
# VÌ SAO CHUYỂN VÀO ĐÂY, thay vì tiếp tục gọi publish-evidence.sh của repo đích:
#
# 1. Bằng chứng là dữ liệu của orch, nằm trên đĩa của orch, và web app đọc nó
#    qua `/api/evidence/…` sau khi kiểm session. Nơi quyết định "thế nào là
#    xanh" và "byte đổ vào đâu" phải nằm cùng chỗ với ranh giới quyền, chứ
#    không nằm trong một file mà agent sửa được rồi merge vào chính repo đó.
#    `from_main` lấy từ origin/HEAD nên agent không sửa được ngay lập tức —
#    nhưng nó chỉ cần một PR được duyệt là đổi được cái cổng đang gác chính nó.
#
# 2. Một bản cài, một phiên bản. Trước đây mỗi repo đích mang một bản copy của
#    script, và bản cũ thì hỏng theo kiểu im lặng.
#
# 3. Không còn credential nào để lộ. MinIO cần access key trong orch.env; bộ
#    nhớ cục bộ thì không cần gì.
#
# BỎ LUÔN GIF. Nó tồn tại chỉ vì URL MinIO là công khai nên GitHub render được
# ảnh ngay trong PR body. Bằng chứng bây giờ nằm sau đăng nhập, GitHub không
# fetch được một byte nào — nên khối trong PR là bảng LIÊN KẾT, và ffmpeg chỉ
# còn để chuyển webm sang mp4 cho tua được. Thiếu ffmpeg thì giữ nguyên webm,
# trình duyệt vẫn phát.

evidence_root() { printf '%s/evidence' "$BEE_SRV"; }
evidence_dir()  { printf '%s/evidence/%s/%s/%s' "$BEE_SRV" "$1" "$2" "$3"; }

# Mốc "đã có bằng chứng cho SHA này" mà rule 04 dùng thay cho việc grep SHA
# trong PR body.
#
# Thư mục chỉ xuất hiện bằng một lần `mv` sau khi mọi file đã ghi xong (xem
# `evidence_write`), nên nó tồn tại là nó đủ. Một thư mục ghi dở sẽ làm mốc này
# nói dối — đó là lý do phải dựng ở chỗ khác rồi mới đổi tên.
evidence_have() { [[ -d "$(evidence_dir "$1" "$2" "$3")" ]]; }

# URL công khai của một thư mục bằng chứng, hoặc mã 1 nếu chưa cấu hình.
evidence_url() {
  [[ -n "${BEE_WEB_URL:-}" ]] || return 1
  printf '%s/api/evidence/%s/%s/%s' "${BEE_WEB_URL%/}" "$1" "$2" "$3"
}

# Cổng duy nhất: chỉ một lần chạy XANH HOÀN TOÀN mới được thành bằng chứng.
# In lý do ra stdout khi từ chối, im lặng khi cho qua.
#
# Cố ý không có cờ --force. Bằng chứng của một suite còn đỏ không phải bằng
# chứng yếu — nó là bằng chứng sai, và nó dạy người review tin nhầm chỗ.
evidence_green() {
  local report="$1" unexpected flaky skipped expected

  [[ -f "$report" ]] || {
    printf 'không tìm thấy `test-results/results.json` — suite chưa chạy được, hoặc chạy mà không bật json reporter'
    return 1
  }
  jq -e . "$report" >/dev/null 2>&1 || {
    printf '`results.json` không phải JSON hợp lệ — suite chết giữa chừng khi đang ghi'
    return 1
  }

  unexpected=$(jq -r '.stats.unexpected // 0' "$report")
  flaky=$(jq     -r '.stats.flaky      // 0' "$report")
  skipped=$(jq   -r '.stats.skipped    // 0' "$report")
  expected=$(jq  -r '.stats.expected   // 0' "$report")

  if [[ "$unexpected" != "0" || "$flaky" != "0" ]]; then
    printf 'suite không xanh (%s đỏ, %s flake) — sửa rồi quay lại, không publish' \
      "$unexpected" "$flaky"
    return 1
  fi
  if [[ "$expected" == "0" ]]; then
    printf 'không test nào chạy — 0 test xanh vẫn là 0 bằng chứng'
    return 1
  fi
  # Một AC bị skip là một AC chưa được chứng minh. Không chặn, nhưng phải kêu:
  # im lặng ở đây là cách nhanh nhất để một PR "có bằng chứng" mà thiếu nửa số AC.
  [[ "$skipped" != "0" ]] && warn "evidence: $skipped test bị skip — những AC đó KHÔNG có bằng chứng"
  return 0
}

# Playwright ghi đường dẫn attachment TUYỆT ĐỐI, tính theo cwd lúc chạy. Rule 04
# lại chuyển `test-results/` ra khỏi worktree trước khi publish (để `git add -A`
# không nuốt vài chục MB video vào PR), nên đường dẫn trong results.json trỏ vào
# một thư mục vừa biến mất.
#
# Trước đây chỗ này chỉ có `[[ -f "$video" ]]`: không khớp thì ô video ghi "không
# có" và cả khối vẫn được publish như thường. Bằng chứng không có video, công bố
# như một lần chạy thành công.
evidence_resolve() {
  local p="$1" results="$2" rel
  [[ -n "$p" ]] || return 1
  [[ -f "$p" ]] && { printf '%s' "$p"; return 0; }
  rel="${p#*/test-results/}"
  [[ "$rel" != "$p" && -f "$results/$rel" ]] && { printf '%s' "$results/$rel"; return 0; }
  return 1
}

# evidence_write <slug> <num> <sha> <results_dir> <run_id>
#
# Dựng thư mục bằng chứng rồi in đường dẫn `evidence.md` ra stdout. Gọi SAU
# `evidence_green`; hàm này không tự kiểm cổng, để chỉ có đúng một chỗ quyết định.
evidence_write() {
  local slug="$1" num="$2" sha="$3" results="$4" run_id="$5"
  local dest stage specs count i spec file title video src out
  local ac_slug ac_label video_cell shots_cell rows='' expected

  dest=$(evidence_dir "$slug" "$num" "$sha")
  stage="$(dirname "$dest")/.tmp-$sha-$$"
  rm -rf -- "$stage"
  mkdir -p "$stage"

  expected=$(jq -r '.stats.expected // 0' "$results/results.json")

  # Playwright lồng suite sâu tuỳ ý — phải recurse, không thể lấy một tầng.
  specs=$(jq -c '
    [ .suites[] | recurse(.suites[]?) | .specs[]?
      | { file:  (.file // ""),
          title: .title,
          video: ( [ .tests[]?.results[]?.attachments[]?
                     | select(.name == "video") | .path ] | first // "" ) }
    ]' "$results/results.json")
  count=$(jq 'length' <<<"$specs")

  for (( i = 0; i < count; i++ )); do
    spec=$(jq -c ".[$i]" <<<"$specs")
    file=$(jq  -r '.file'  <<<"$spec")
    title=$(jq -r '.title' <<<"$spec")
    video=$(jq -r '.video' <<<"$spec")

    # e2e/ac-2-het-han-token.spec.ts → ac-2 → AC-2
    ac_slug=$(basename "$file" | sed -E 's/\.spec\.(ts|js)$//')
    if [[ "$ac_slug" =~ ^(ac-[0-9]+) ]]; then
      ac_label=$(tr '[:lower:]' '[:upper:]' <<<"${BASH_REMATCH[1]}")
      ac_slug="${BASH_REMATCH[1]}"
    else
      # Spec không đặt tên theo AC vẫn được lưu, chỉ là không gắn được vào
      # checkbox nào trong issue.
      ac_label="—"
    fi

    video_cell="_không có_"
    if src=$(evidence_resolve "$video" "$results"); then
      if command -v ffmpeg >/dev/null 2>&1; then
        out="$stage/$ac_slug.mp4"
        if ffmpeg -y -loglevel error -i "$src" \
             -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an "$out" 2>/dev/null; then
          video_cell="[mp4]($ac_slug.mp4)"
        else
          # ffmpeg đổ (codec lạ, file cụt) thì giữ bản gốc còn hơn mất hẳn.
          rm -f -- "$out"
          cp -- "$src" "$stage/$ac_slug.webm"
          video_cell="[webm]($ac_slug.webm)"
        fi
      else
        cp -- "$src" "$stage/$ac_slug.webm"
        video_cell="[webm]($ac_slug.webm)"
      fi
    fi

    # Ảnh chụp có chủ đích trong test: test-results/shots/ac-2-*.png
    local shots=() shot name label s
    shopt -s nullglob
    for shot in "$results"/shots/"$ac_slug"-*.png; do
      name=$(basename "$shot")
      cp -- "$shot" "$stage/$name"
      label=$(sed -E "s/^$ac_slug-//; s/\.png$//" <<<"$name")
      shots+=("[$label]($name)")
    done
    shopt -u nullglob

    # Nối tay: "${arr[*]}" với IFS nhiều ký tự chỉ dùng ký tự đầu.
    shots_cell="—"
    if (( ${#shots[@]} > 0 )); then
      shots_cell="${shots[0]}"
      for (( s = 1; s < ${#shots[@]}; s++ )); do shots_cell+=" · ${shots[$s]}"; done
    fi

    # Spec được đặt tên đúng quy ước thì title đã mở đầu bằng "AC-1 —" rồi;
    # ghép thêm nhãn nữa ra "AC-1 — AC-1 — …".
    if [[ "$title" == "$ac_label"* ]]; then
      rows+="| $title | ✅ pass | $video_cell | $shots_cell |"$'\n'
    else
      rows+="| $ac_label — $title | ✅ pass | $video_cell | $shots_cell |"$'\n'
    fi
  done

  cp -- "$results/results.json" "$stage/results.json" 2>/dev/null || true

  # Khối cho PR body. Đường dẫn trong bảng là TƯƠNG ĐỐI ở bản trên đĩa (mở thẳng
  # trong dashboard) và được nới thành tuyệt đối khi ghi vào PR — xem cuối hàm.
  {
    echo "<!-- evidence:start -->"
    echo "## Bằng chứng"
    echo
    echo "| AC | Kết quả | Video | Ảnh |"
    echo "|---|---|---|---|"
    printf '%s' "$rows"
    echo
    echo "\`$expected/$expected passed\` · \`không flake\` · run \`$run_id\` · commit \`${sha:0:7}\`"
    echo "<!-- evidence:end -->"
  } > "$stage/evidence.md"

  # Group lấy từ CHÍNH thư mục evidence, không phải hằng số `$BEE_GROUP`.
  #
  # `/srv/bee/evidence` thuộc group `bee-web` chứ không phải `bee`, và đó là cả
  # thiết kế: group `bee` có quyền GHI khắp /srv/bee (bee-agent cần thế), nên
  # cho bee-web vào group đó để đọc bằng chứng là mở luôn quyền ghi vào thư mục
  # mà reconciler tin rằng chỉ mình nó viết.
  #
  # Đọc group tại chỗ thay vì ghi cứng: installer là nơi quyết định, và một hằng
  # số ở đây sẽ lệch khỏi nó vào một ngày không ai nhớ.
  local gr; gr=$(stat -c %G "$(evidence_root)" 2>/dev/null || printf '%s' "$BEE_GROUP")
  chgrp -R "$gr" "$stage" 2>/dev/null || true
  chmod -R g+rX,o-rwx "$stage" 2>/dev/null || true

  # Đổi tên là bước cuối cùng và là bước duy nhất mà người ngoài nhìn thấy.
  rm -rf -- "$dest"
  mkdir -p "$(dirname "$dest")"
  mv -- "$stage" "$dest"

  printf '%s/evidence.md' "$dest"
}

# Bản dành cho PR body: nới đường dẫn tương đối thành URL đầy đủ. Chưa cấu hình
# `BEE_WEB_URL` thì bỏ hẳn liên kết thay vì đẻ ra URL tương đối — một link tương
# đối trong PR body sẽ trỏ vào github.com và dẫn người review đi lạc.
evidence_block_for_pr() {
  local slug="$1" num="$2" sha="$3" md="$4" base
  if base=$(evidence_url "$slug" "$num" "$sha"); then
    sed -E "s|\]\(([A-Za-z0-9._-]+)\)|](${base}/\1)|g" "$md"
  else
    sed -E 's#\[([^]]+)\]\([A-Za-z0-9._-]+\)#\1#g' "$md"
    echo
    echo "_Chưa đặt \`BEE_WEB_URL\` trong \`/etc/bee/bee.env\` nên không có liên kết._"
    echo "_File nằm ở \`$(evidence_dir "$slug" "$num" "$sha")\` trên máy chạy bee._"
  fi
}

# ---------------------------------------------------------------------------
# Dọn — R3.2
#
# Chạy từ dispatcher chứ không phải từ một rule: nó không gọi model, không cần
# worktree, không đáng chiếm một slot. Nhưng nó có gọi API, nên phải có nhịp
# riêng — mỗi giờ một lần, không phải mỗi tick.
# ---------------------------------------------------------------------------

# Đúng một lần trong <giây>. Trả 0 nếu tới lượt.
evidence_sweep_due() {
  local stamp="$BEE_SRV/state/evidence-sweep" every="${1:-3600}" last=0
  [[ -f "$stamp" ]] && last=$(cat "$stamp" 2>/dev/null || echo 0)
  (( $(now_epoch) - last < every )) && return 1
  mkdir -p "$(dirname "$stamp")"
  printf '%d' "$(now_epoch)" > "$stamp"
  return 0
}

# evidence_sweep <slug>
#
# Hai lý do xoá, và chúng bắt hai trường hợp khác nhau:
#
#   PR đã đóng   — review xong rồi, video 40MB không còn ai mở nữa.
#   Quá 90 ngày  — PR chưa bao giờ đóng. Không có luật này thì một PR bị bỏ
#                  quên giữ bằng chứng vĩnh viễn, và đĩa đầy vào một đêm nào đó.
#
# Hỏi từng số một chứ không lấy danh sách PR đang mở rồi trừ: `gh pr list` có
# trần 100, và một repo vượt trần sẽ làm ta xoá bằng chứng của PR VẪN ĐANG MỞ.
# Số thư mục bằng chứng luôn nhỏ, nên vài lời gọi API mỗi giờ là rẻ.
evidence_sweep() {
  local slug="$1" root numdir shadir num sha state age now
  root="$(evidence_root)/$slug"
  [[ -d "$root" ]] || return 0
  now=$(now_epoch)

  for numdir in "$root"/*; do
    [[ -d "$numdir" ]] || continue
    num=$(basename "$numdir")
    [[ "$num" =~ ^[0-9]+$ ]] || continue

    state=$(gh pr view "$num" --repo "$REPO_FULL" --json state --jq '.state' 2>/dev/null || true)
    # Rỗng = không hỏi được (mạng, rate limit, PR bị xoá). Giữ lại: xoá nhầm
    # bằng chứng của một PR đang chờ review đắt hơn nhiều so với giữ thừa một giờ.
    if [[ "$state" == "CLOSED" || "$state" == "MERGED" ]]; then
      rm -rf -- "$numdir"
      info "evidence: dọn $slug#$num ($state)"
      continue
    fi

    for shadir in "$numdir"/*; do
      [[ -d "$shadir" ]] || continue
      sha=$(basename "$shadir")
      age=$(( (now - $(stat -c %Y "$shadir" 2>/dev/null || echo "$now")) / 86400 ))
      if (( age > ${EVIDENCE_KEEP_DAYS:-90} )); then
        rm -rf -- "$shadir"
        info "evidence: dọn $slug#$num/${sha:0:7} (quá $age ngày)"
      fi
    done

    rmdir -- "$numdir" 2>/dev/null || true
  done
  rmdir -- "$root" 2>/dev/null || true
}
