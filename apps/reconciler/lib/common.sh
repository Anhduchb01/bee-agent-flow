#!/usr/bin/env bash
# common.sh — log, màu, tiện ích dùng chung. Được source, không chạy trực tiếp.

# Ghim locale. systemd cấp cho service một môi trường KHÔNG có LANG, và khi đó
# sed/grep xử lý UTF-8 theo từng byte: "Thêm" thành "thaem" thay vì "them", tên
# nhánh vừa xấu vừa dễ đụng nhau. Ghim ở đây thì mọi script đều được, vì tất cả
# đều source file này.
export LC_ALL=C.UTF-8
export LANG=C.UTF-8

BEE_PREFIX="${BEE_PREFIX:-/opt/bee}"
BEE_ETC="${BEE_ETC:-/etc/bee}"
BEE_SRV="${BEE_SRV:-/srv/bee}"

ORCH_USER="bee-orch"
AGENT_USER="bee-agent"
BEE_GROUP="bee"

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_CYAN=$'\033[36m'; C_BOLD=$'\033[1m'
else
  C_RESET=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_CYAN=''; C_BOLD=''
fi

log()  { printf '%s\n' "$*" >&2; }
info() { printf '%s%s%s\n' "$C_CYAN" "$*" "$C_RESET" >&2; }
warn() { printf '%s%s%s\n' "$C_YELLOW" "$*" "$C_RESET" >&2; }
die()  { printf '%s%s%s\n' "$C_RED" "$*" "$C_RESET" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "thiếu lệnh: $1"; }

now_iso()  { date -u +%Y-%m-%dT%H:%M:%SZ; }
now_epoch() { date +%s; }

# Rút gọn giây thành "12m41s" / "1h04m" cho dễ đọc trên dashboard.
human_dur() {
  local s=${1:-0}
  if   (( s < 60 ));   then printf '%ds' "$s"
  elif (( s < 3600 )); then printf '%dm%02ds' $(( s / 60 )) $(( s % 60 ))
  else                      printf '%dh%02dm' $(( s / 3600 )) $(( s % 3600 / 60 ))
  fi
}

# Slug an toàn cho tên instance systemd và tên nhánh git: chỉ [a-z0-9-].
#
# Bỏ dấu tiếng Việt trước, vì iconv //TRANSLIT chèn ký tự rác ("Thêm" → "Th^em")
# và tên nhánh sẽ vừa xấu vừa dễ đụng nhau.
slugify() {
  printf '%s' "$1" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E '
      s/[àáạảãâầấậẩẫăằắặẳẵ]/a/g
      s/[èéẹẻẽêềếệểễ]/e/g
      s/[ìíịỉĩ]/i/g
      s/[òóọỏõôồốộổỗơờớợởỡ]/o/g
      s/[ùúụủũưừứựửữ]/u/g
      s/[ỳýỵỷỹ]/y/g
      s/đ/d/g
      s#^.*/##
      s/[^a-z0-9]+/-/g
      s/-+/-/g
      s/^-+|-+$//g
    '
}

# Chạy lệnh dưới quyền agent. sudo tự bật env_reset nên môi trường bị dọn sạch —
# đây chính là cách agent không bao giờ nhìn thấy GH_TOKEN.
as_agent() { sudo -u "$AGENT_USER" -H "$@"; }

# "user X có thuộc group G không".
#
# `id -nG X | grep -qw G` KHÔNG trả lời được câu này: với grep, dấu gạch ngang là
# ranh giới từ, nên `bee-web` khớp `\bbee\b`. Mọi câu hỏi về group `bee` sẽ trả
# lời CÓ cho mọi user tên `bee-*` — và câu hỏi đó là một trong những chốt an
# toàn của hệ thống này.
thuoc_group() {
  id -nG "$1" 2>/dev/null | tr ' ' '\n' | grep -qx "$2"
}
