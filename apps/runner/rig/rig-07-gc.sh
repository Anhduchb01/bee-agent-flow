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

echo
if [[ $FAIL == 0 ]]; then echo "RIG-07: TẤT CẢ XANH"; else echo "RIG-07: CÓ ĐỎ"; exit 1; fi
