#!/usr/bin/env bash
# Rig-06 — dựng worktree KHÔNG được làm mất việc đã làm.
#
# Vì sao có rig này: gc (V3.T1) sẽ xoá worktree của phiên đã xong, và resume
# phải dựng lại được. Nếu lệnh dựng lại reset nhánh về main thì mọi commit
# chưa push bay sạch — hỏng im lặng, người dùng chỉ thấy "worktree trống".
#
# Chạy offline hoàn toàn: bare repo cục bộ, không remote, không systemd, không claude.
set -euo pipefail

DAY=$(dirname "$(readlink -f "$0")")
# shellcheck disable=SC1091
source "$DAY/../lib/common.sh" 2>/dev/null || source "$DAY/../lib/common.sh"

FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

# --- sân giả: một bare repo có nhánh main với đúng một commit ---------------
BARE="$T/repo.git"
git init -q --bare "$BARE"
git init -q "$T/seed"
git -C "$T/seed" config user.email rig@bee && git -C "$T/seed" config user.name rig
echo main-file > "$T/seed/main.txt"
git -C "$T/seed" add -A && git -C "$T/seed" commit -qm "commit của main"
git -C "$T/seed" push -q "$BARE" HEAD:main
git --git-dir="$BARE" symbolic-ref HEAD refs/heads/main

BRANCH="bee/rig-1"

lam_viec() {  # commit một file trong worktree, in ra sha
  local wt="$1"
  git -C "$wt" config user.email rig@bee && git -C "$wt" config user.name rig
  echo "việc của phiên" > "$wt/viec.txt"
  git -C "$wt" add -A && git -C "$wt" commit -qm "việc phiên đã làm"
  git -C "$wt" rev-parse HEAD
}

# --- 1. Phiên mới: nhánh chưa tồn tại → tạo từ nhánh mặc định --------------
dung_worktree "$BARE" "$T/wt1" "$BRANCH" main
if [[ -f "$T/wt1/main.txt" ]] && git --git-dir="$BARE" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  kq ok "phiên mới: dựng nhánh $BRANCH từ main"
else
  kq no "phiên mới: không dựng được worktree/nhánh"
fi

SHA_VIEC=$(lam_viec "$T/wt1")

# --- 2. gc xoá worktree đúng cách → dựng lại KHÔNG được reset nhánh --------
git --git-dir="$BARE" worktree remove --force "$T/wt1"
dung_worktree "$BARE" "$T/wt2" "$BRANCH" main
SHA_SAU=$(git --git-dir="$BARE" rev-parse "$BRANCH")
if [[ "$SHA_SAU" == "$SHA_VIEC" ]]; then
  kq ok "dựng lại sau gc: nhánh vẫn ở commit của phiên ($( cut -c1-7 <<<"$SHA_VIEC"))"
else
  kq no "dựng lại sau gc ĐÃ RESET nhánh: $(cut -c1-7 <<<"$SHA_VIEC") → $(cut -c1-7 <<<"$SHA_SAU") — commit chưa push bay mất"
fi
[[ -f "$T/wt2/viec.txt" ]] \
  && kq ok "dựng lại sau gc: file của phiên còn nguyên trong worktree" \
  || kq no "dựng lại sau gc: mất file viec.txt"

# --- 3. Worktree bị rm -rf (crash, hoặc gc thô) → vẫn dựng lại được -------
rm -rf "$T/wt2"
if dung_worktree "$BARE" "$T/wt3" "$BRANCH" main 2>"$T/err3"; then
  SHA3=$(git --git-dir="$BARE" rev-parse "$BRANCH")
  [[ "$SHA3" == "$SHA_VIEC" ]] \
    && kq ok "worktree bị rm -rf: dựng lại được, nhánh không đổi" \
    || kq no "worktree bị rm -rf: nhánh đổi $(cut -c1-7 <<<"$SHA3")"
else
  kq no "worktree bị rm -rf: không dựng lại được ($(head -1 "$T/err3"))"
fi

# --- 4. Nhánh đang bị worktree KHÁC giữ → từ chối, không phá --------------
if dung_worktree "$BARE" "$T/wt4" "$BRANCH" main 2>/dev/null; then
  kq no "nhánh đang bị giữ: lẽ ra phải từ chối, nhưng đã dựng hai worktree cùng một nhánh"
else
  SHA4=$(git --git-dir="$BARE" rev-parse "$BRANCH")
  [[ "$SHA4" == "$SHA_VIEC" ]] \
    && kq ok "nhánh đang bị giữ: từ chối tử tế, nhánh không suy suyển" \
    || kq no "nhánh đang bị giữ: từ chối nhưng vẫn kịp phá nhánh"
fi

echo
if [[ $FAIL == 0 ]]; then echo "RIG-06: TẤT CẢ XANH"; else echo "RIG-06: CÓ ĐỎ"; exit 1; fi
