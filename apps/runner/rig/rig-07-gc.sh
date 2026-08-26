#!/usr/bin/env bash
# Rig-07 — gc.sh thu hồi worktree mà KHÔNG được làm mất việc.
#
# Chạy offline: bare repo cục bộ đóng vai "origin", không systemd, không mạng.
# Sáu tình huống, và năm trong số đó là "ĐỪNG đụng vào":
#   running · needs_human · còn mới · chưa push hết · (đã push) · (đã merge)
set -euo pipefail

DAY=$(dirname "$(readlink -f "$0")")
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export BEE_ROOT="$T/srv" BEE_RUNTIME="$T/run"
mkdir -p "$BEE_ROOT"/{sessions,work,repos} "$BEE_RUNTIME"

# --- "GitHub" giả + bare clone của bee ------------------------------------
ORIGIN="$T/origin.git"; git init -q --bare "$ORIGIN"
git init -q "$T/seed"; git -C "$T/seed" config user.email r@b; git -C "$T/seed" config user.name r
echo base > "$T/seed/f"; git -C "$T/seed" add -A; git -C "$T/seed" commit -qm base
git -C "$T/seed" push -q "$ORIGIN" HEAD:main

BARE="$BEE_ROOT/repos/myapp.git"
git clone -q --bare "$ORIGIN" "$BARE"
git --git-dir="$BARE" remote add origin "$ORIGIN" 2>/dev/null || true
git --git-dir="$BARE" symbolic-ref HEAD refs/heads/main

XUA=$(date -u -d '48 hours ago' +%Y-%m-%dT%H:%M:%SZ)
NAY=$(date -u -d '1 hour ago'  +%Y-%m-%dT%H:%M:%SZ)

# phien <id> <num> <status> <ended_at> <needs_human>
phien() {
  local id="$1" num="$2" st="$3" end="$4" nh="${5:-false}"
  local sd="$BEE_ROOT/sessions/$id"
  mkdir -p "$sd/evidence"
  jq -cn --arg i "$id" --argjson n "$num" \
    '{id:$i, slug:"myapp", num:$n, repo:"you/myapp", worktree:true}' > "$sd/session.json"
  jq -cn --arg s "$st" --arg e "$end" --argjson h "$nh" \
    '{status:$s, ended_at:$e, needs_human:$h}' > "$sd/meta.json"
  echo '{"type":"bee_lifecycle","msg":"x"}' > "$sd/run.jsonl"
  echo "ảnh chụp" > "$sd/evidence/shot.png"
  git --git-dir="$BARE" worktree add -q -b "bee/myapp-$num" "$BEE_ROOT/work/$id" main
}
commit_trong() { git -C "$1" config user.email r@b; git -C "$1" config user.name r
                 echo x > "$1/new-$RANDOM"; git -C "$1" add -A; git -C "$1" commit -qm "việc"; }

ID_CHAY=aaaaaaaa-0000-4000-8000-000000000001   # 1 · đang chạy
ID_XONG=aaaaaaaa-0000-4000-8000-000000000002   # 2 · xong + đã push
ID_NGUOI=aaaaaaaa-0000-4000-8000-000000000003  # 3 · needs_human
ID_MOI=aaaaaaaa-0000-4000-8000-000000000004    # 4 · vừa dừng
ID_CHUA=aaaaaaaa-0000-4000-8000-000000000005   # 5 · còn commit chưa push
ID_MERGE=aaaaaaaa-0000-4000-8000-000000000006  # 6 · đã merge vào main
ID_MU=aaaaaaaa-0000-4000-8000-000000000007     # 7 · origin không đọc được
ID_BAN=aaaaaaaa-0000-4000-8000-000000000008    # 8 · đã push NHƯNG worktree còn bẩn

phien "$ID_CHAY"  1 running "" false
phien "$ID_XONG"  2 done    "$XUA" false
phien "$ID_NGUOI" 3 failed  "$XUA" true
phien "$ID_MOI"   4 stopped "$NAY" false
phien "$ID_CHUA"  5 done    "$XUA" false
phien "$ID_MERGE" 6 done    "$XUA" false
phien "$ID_MU"    7 done    "$XUA" false
phien "$ID_BAN"   8 done    "$XUA" false

commit_trong "$BEE_ROOT/work/$ID_XONG"
git -C "$BEE_ROOT/work/$ID_XONG" push -q "$ORIGIN" "bee/myapp-2:bee/myapp-2"   # đã push
commit_trong "$BEE_ROOT/work/$ID_CHUA"                                        # KHÔNG push
commit_trong "$BEE_ROOT/work/$ID_MERGE"
git -C "$BEE_ROOT/work/$ID_MERGE" push -q "$ORIGIN" "HEAD:main"               # vào main
git --git-dir="$BARE" fetch -q origin "+refs/heads/main:refs/heads/main"

# Ca 8: nhánh đã push HẾT, nhưng agent còn để lại sửa đổi chưa commit trong
# worktree (phiên bị kill giữa chừng). "Đã push" nói về NHÁNH, không nói gì về
# thư mục làm việc — xoá lúc này là mất việc thật.
git -C "$BEE_ROOT/work/$ID_BAN" push -q "$ORIGIN" "bee/myapp-8:bee/myapp-8"
echo "đang sửa dở" > "$BEE_ROOT/work/$ID_BAN/dang-lam.txt"
echo "node_modules/" > "$BEE_ROOT/work/$ID_BAN/.gitignore"
mkdir -p "$BEE_ROOT/work/$ID_BAN/node_modules" && echo x > "$BEE_ROOT/work/$ID_BAN/node_modules/rac"

# Ca 7: bare riêng, origin trỏ vào chỗ không tồn tại → ls-remote hỏng.
BARE_MU="$BEE_ROOT/repos/mu.git"
git clone -q --bare "$ORIGIN" "$BARE_MU"
git --git-dir="$BARE_MU" remote set-url origin "$T/khong-co-that.git"
jq -c '.slug="mu"' "$BEE_ROOT/sessions/$ID_MU/session.json" > "$T/s7" && mv "$T/s7" "$BEE_ROOT/sessions/$ID_MU/session.json"
git --git-dir="$BARE_MU" worktree add -q -b "bee/mu-7" "$T/wt-mu" main
rm -rf "$BEE_ROOT/work/$ID_MU" && mv "$T/wt-mu" "$BEE_ROOT/work/$ID_MU"

# --- chạy gc ---------------------------------------------------------------
GC_AGE_H=24 bash "$DAY/../bin/gc.sh" >/dev/null 2>&1 || kq no "gc.sh chạy lỗi"

con() { [[ -d "$BEE_ROOT/work/$1" ]]; }
ly_do() { jq -r --arg i "$1" '.items[] | select(.id==$i) | .reason' "$BEE_ROOT/gc.json" 2>/dev/null; }

con "$ID_CHAY"  && kq ok "phiên đang chạy: không đụng"            || kq no "phiên đang chạy BỊ XOÁ"
con "$ID_NGUOI" && kq ok "needs_human: không đụng ($(ly_do "$ID_NGUOI"))" || kq no "needs_human BỊ XOÁ"
con "$ID_MOI"   && kq ok "vừa dừng < 24h: không đụng"             || kq no "phiên còn mới BỊ XOÁ"
con "$ID_CHUA"  && kq ok "còn commit chưa push: giữ ($(ly_do "$ID_CHUA"))" || kq no "MẤT VIỆC: xoá worktree còn commit chưa push"

con "$ID_XONG"  && kq no "đã push + quá hạn: lẽ ra phải thu hồi"  || kq ok "đã push + quá hạn: đã thu hồi"
con "$ID_MERGE" && kq no "đã merge vào main: lẽ ra phải thu hồi"  || kq ok "đã merge vào main: đã thu hồi"

# Không đọc được origin thì GIỮ — và phải nói ĐÚNG lý do, không đoán "mất mạng"
if con "$ID_MU" && [[ "$(ly_do "$ID_MU")" == *"không hỏi được origin"* ]]; then
  case "$(ly_do "$ID_MU")" in
    *fatal*|*"not found"*|*"does not exist"*) kq ok "origin không đọc được: giữ + chép lại lỗi git thật";;
    *) kq no "origin không đọc được: giữ nhưng lý do là phỏng đoán — '$(ly_do "$ID_MU")'";;
  esac
else
  kq no "origin không đọc được: lẽ ra phải giữ (hiện: $(ly_do "$ID_MU"))"
fi

if con "$ID_BAN" && [[ "$(ly_do "$ID_BAN")" == *"chưa commit"* ]]; then
  kq ok "đã push nhưng worktree còn bẩn: giữ ($(ly_do "$ID_BAN"))"
else
  kq no "MẤT VIỆC: xoá worktree còn sửa đổi chưa commit (lý do: $(ly_do "$ID_BAN"))"
fi

# Evidence + run.jsonl của phiên ĐÃ THU HỒI phải còn — xem lại được sau khi dọn
[[ -f "$BEE_ROOT/sessions/$ID_XONG/evidence/shot.png" && -f "$BEE_ROOT/sessions/$ID_XONG/run.jsonl" ]] \
  && kq ok "evidence + run.jsonl còn nguyên sau khi thu hồi worktree" \
  || kq no "MẤT BẰNG CHỨNG: gc đụng vào sessions/<id>/"

# Nhánh: đã merge thì xoá được; đã push nhưng chưa merge thì GIỮ (PR còn sống)
git --git-dir="$BARE" show-ref -q --verify refs/heads/bee/myapp-2 \
  && kq ok "nhánh đã push chưa merge: giữ lại (PR còn sống)" \
  || kq no "nhánh đã push chưa merge BỊ XOÁ"

jq -e '.freed_bytes > 0 and .removed == 2' "$BEE_ROOT/gc.json" >/dev/null 2>&1 \
  && kq ok "gc.json: removed=2 kèm freed_bytes" \
  || kq no "gc.json sai: $(jq -c '{removed,freed_bytes}' "$BEE_ROOT/gc.json" 2>/dev/null)"

# --- chạy lần hai: phải là no-op ------------------------------------------
GC_AGE_H=24 bash "$DAY/../bin/gc.sh" >/dev/null 2>&1
jq -e '.removed == 0' "$BEE_ROOT/gc.json" >/dev/null 2>&1 \
  && kq ok "chạy lại: no-op, không lỗi (idempotent)" \
  || kq no "chạy lại không phải no-op"

# ══════════════════════════════════════════════════════════════════════════
# Phần 2 · Docker: thu hồi worktree phải kéo theo compose project của phiên
# ══════════════════════════════════════════════════════════════════════════
#
# Nợ có trước cả T15: gc không có một dòng docker nào, nên một phiên tự
# `compose up` là để lại container + volume vĩnh viễn. Máy thật đang có 6.9GB
# volume / 17 cái là bằng chứng chuyện đó xảy ra.
#
# Sáu ca, và bốn trong số đó là "ĐỪNG đụng vào" — cùng tinh thần phần 1.
echo
echo "-- phần 2 · docker --"

mkdir -p "$T/bin"
export RIG_DOCKER_LOG="$T/docker.log"
: > "$RIG_DOCKER_LOG"

# Stub docker. Nó ghi lại MỌI lệnh kèm việc worktree còn tồn tại hay chưa —
# "container trước, worktree sau" chỉ kiểm được bằng cách đó.
cat > "$T/bin/docker" <<'EOF'
#!/usr/bin/env bash
con="no"; [[ -n "${RIG_WT:-}" && -d "$RIG_WT" ]] && con="yes"
echo "wt:$con | $*" >> "$RIG_DOCKER_LOG"
[[ "$1" == info ]] && { [[ "${RIG_DOCKER_UP:-1}" == 1 ]] && exit 0 || exit 1; }
if [[ "$1" == ps ]]; then
  for pj in ${RIG_DOCKER_PROJECTS:-}; do
    case " $* " in *"project=$pj"*) echo "c0ffeec0ffee"; exit 0;; esac
  done
  exit 0
fi
exit 0
EOF
chmod +x "$T/bin/docker"
export PATH="$T/bin:$PATH"

# Sân sạch cho phần 2: dùng lại đúng bare + origin ở trên.
san2() {   # san2 <id> <num> <status> <needs_human> <có-compose>
  local id="$1" num="$2" st="$3" nh="$4" co="$5"
  phien "$id" "$num" "$st" "$XUA" "$nh"
  commit_trong "$BEE_ROOT/work/$id"
  git -C "$BEE_ROOT/work/$id" push -q "$ORIGIN" "bee/myapp-$num:bee/myapp-$num"
  [[ "$co" == co ]] && printf 'services:\n  db:\n    image: postgres:16\n' \
    > "$BEE_ROOT/work/$id/docker-compose.yml"
  # compose file chưa commit sẽ làm worktree "bẩn" → gc giữ vì lý do khác.
  # Ở đây nó là file của repo, nên commit + push cho sạch.
  if [[ "$co" == co ]]; then
    git -C "$BEE_ROOT/work/$id" add -A
    git -C "$BEE_ROOT/work/$id" commit -qm compose
    git -C "$BEE_ROOT/work/$id" push -q "$ORIGIN" "bee/myapp-$num:bee/myapp-$num"
  fi
}

ID_D1=bbbbbbbb-0000-4000-8000-000000000001   # có compose, docker sống
ID_D2=bbbbbbbb-0000-4000-8000-000000000002   # có compose, docker CHẾT
ID_D3=bbbbbbbb-0000-4000-8000-000000000003   # KHÔNG compose, docker chết
ID_D4=bbbbbbbb-0000-4000-8000-000000000004   # needs_human, có compose

# Mỗi ca dựng NGAY TRƯỚC lượt gc của nó. Dựng hết từ đầu thì lượt gc đầu tiên
# (docker còn sống) sẽ thu hồi luôn mấy ca dành cho lượt sau, và bài test đo
# một cái sân đã bị dọn mất.
san2 "$ID_D1" 11 done   false co
san2 "$ID_D4" 14 failed true  co

# --- ca 1+2: docker sống, phiên D1 có container ---------------------------
: > "$RIG_DOCKER_LOG"
RIG_WT="$BEE_ROOT/work/$ID_D1" RIG_DOCKER_UP=1 \
  RIG_DOCKER_PROJECTS="bee-bbbbbbbb bee-myapp-11" \
  GC_AGE_H=24 bash "$DAY/../bin/gc.sh" >/dev/null 2>&1 || true

grep -q "compose .*-p .*down" "$RIG_DOCKER_LOG" \
  && kq ok "phiên có compose project: gc gọi compose down" \
  || kq no "gc KHÔNG hạ compose project — container + volume ở lại vĩnh viễn"

grep -q -- "-v" <<<"$(grep 'down' "$RIG_DOCKER_LOG")" \
  && kq ok "down kèm -v: volume cũng đi theo (đó mới là phần chiếm đĩa)" \
  || kq no "down thiếu -v: volume mồ côi ở lại"

[[ "$(grep 'down' "$RIG_DOCKER_LOG" | head -1)" == wt:yes* ]] \
  && kq ok "thứ tự đúng: hạ container TRƯỚC khi xoá worktree" \
  || kq no "hạ container sau khi worktree đã biến mất — compose mất file để đọc"

con "$ID_D1" && kq no "D1: lẽ ra phải thu hồi" || kq ok "D1: worktree đã thu hồi"
[[ "$(ly_do "$ID_D1")" == *docker* || "$(ly_do "$ID_D1")" == *compose* ]] \
  && kq ok "gc.json nói ra đã dọn docker ($(ly_do "$ID_D1"))" \
  || kq no "gc.json im lặng về phần docker: $(ly_do "$ID_D1")"

# --- ca 4: needs_human thì KHÔNG được đụng container ----------------------
grep -q "project=bee-myapp-14\|project=bee-bbbbbbbb" <<<"$(grep 'down' "$RIG_DOCKER_LOG")" \
  && kq no "needs_human mà vẫn hạ container của nó — người còn phải xem cái xác" \
  || kq ok "needs_human: container để nguyên, không đụng"

# --- ca 3: docker CHẾT + worktree có compose → GIỮ ------------------------
san2 "$ID_D2" 12 done false co
san2 "$ID_D3" 13 done false khong
: > "$RIG_DOCKER_LOG"
RIG_WT="$BEE_ROOT/work/$ID_D2" RIG_DOCKER_UP=0 \
  GC_AGE_H=24 bash "$DAY/../bin/gc.sh" >/dev/null 2>&1 || true

if con "$ID_D2" && [[ "$(ly_do "$ID_D2")" == *docker* ]]; then
  kq ok "docker chết + worktree có compose: GIỮ ($(ly_do "$ID_D2"))"
else
  kq no "xoá worktree khi không dọn nổi container — container thành mồ côi không ai lần ra ($(ly_do "$ID_D2"))"
fi

# --- ca 4: docker chết nhưng phiên KHÔNG có compose → vẫn thu hồi ---------
con "$ID_D3" \
  && kq no "docker chết chặn oan một phiên chưa từng dùng docker ($(ly_do "$ID_D3"))" \
  || kq ok "docker chết nhưng phiên không có compose: vẫn thu hồi bình thường"

# --- ca 5: máy không có docker + không compose → vẫn thu hồi --------------
ID_D5=bbbbbbbb-0000-4000-8000-000000000005
san2 "$ID_D5" 15 done false khong
PATH_CU="$PATH"; PATH="/usr/bin:/bin"; export PATH
GC_AGE_H=24 bash "$DAY/../bin/gc.sh" >/dev/null 2>&1 || true
PATH="$PATH_CU"; export PATH
con "$ID_D5" \
  && kq no "máy không có docker: chặn oan phiên không dùng docker ($(ly_do "$ID_D5"))" \
  || kq ok "máy không có docker + phiên không compose: vẫn thu hồi"

echo
if [[ $FAIL == 0 ]]; then echo "RIG-07: TẤT CẢ XANH"; else echo "RIG-07: CÓ ĐỎ"; exit 1; fi
