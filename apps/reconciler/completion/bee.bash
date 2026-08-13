# bash completion cho be / bee — cài vào /etc/bash_completion.d/be
#
# Tab điền được cả tên repo lẫn id task đang chạy, nên bạn không phải nhớ
# "myapp-42" hay gõ lại nó.

_bee() {
  local cur prev cmds
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  cmds="status doctor dry-run logs pause resume repo uninstall help
        st dr dry lg ra p r -w --watch -h --help"

  if (( COMP_CWORD == 1 )); then
    mapfile -t COMPREPLY < <(compgen -W "$cmds" -- "$cur")
    return
  fi

  case "${COMP_WORDS[1]}" in
    logs|lg)
      # id các task đang chạy — lấy thẳng từ systemd, không đoán.
      mapfile -t COMPREPLY < <(compgen -W "$(
        systemctl list-units --type=service --no-legend --plain 'bee-task@*.service' 2>/dev/null \
          | awk '{print $1}' | sed -E 's/^bee-task@(.*)\.service$/\1/'
      )" -- "$cur")
      ;;
    repo)
      if (( COMP_CWORD == 2 )); then
        mapfile -t COMPREPLY < <(compgen -W "add list enable disable remove" -- "$cur")
      elif [[ "$prev" =~ ^(enable|disable|remove)$ ]]; then
        mapfile -t COMPREPLY < <(compgen -W "$(
          ls /etc/bee/repos.d/*.env 2>/dev/null | xargs -rn1 basename | sed 's/\.env$//'
        )" -- "$cur")
      fi
      ;;
  esac
}

# Đăng ký cho cả hai tên: `be` là thứ bạn gõ, `bee` là symlink.
complete -F _bee be bee
