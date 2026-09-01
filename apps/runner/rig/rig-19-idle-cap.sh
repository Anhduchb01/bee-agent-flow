#!/usr/bin/env bash
# Rig-19 — the IDLE ceiling for one session, measured from the LAST event.
#
# Why this file exists: the unit's `RuntimeMaxSec=6h` counted wall time from
# the moment a session started, so it killed sessions for WAITING — a question
# asked at midnight was dead before anyone woke up (seen for real 01/09). The
# rule replacing it has to tell "waiting for an answer" apart from "forgotten",
# and that distinction is what this rig proves.
set -euo pipefail

DAY=$(dirname "$(readlink -f "$0")")
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export BEE_ROOT="$T/srv" BEE_RUNTIME="$T/run"
mkdir -p "$BEE_ROOT/sessions" "$BEE_RUNTIME"

# Fake systemctl: every unit is "active" except an id named in RIG_DEAD, and
# every stop is logged.
mkdir -p "$T/bin"
export RIG_STOP_LOG="$T/stop.log"; : > "$RIG_STOP_LOG"
export RIG_DEAD=""
cat > "$T/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
unit=""
for a in "$@"; do case "$a" in bee-session@*) unit="$a";; esac; done
for a in "$@"; do [[ "$a" == "stop" ]] && { echo "$*" >> "$RIG_STOP_LOG"; exit 0; }; done
case " $* " in *" is-active "*)
  if [[ -n "$RIG_DEAD" && "$unit" == *"$RIG_DEAD"* ]]; then echo inactive; exit 3; fi
  echo active; exit 0;;
esac
exit 0
EOF
chmod +x "$T/bin/systemctl"; export PATH="$T/bin:$PATH"

# make_session_dir <id> <status> <hours since the last line in run.jsonl>
make_session_dir() {
  local id="$1" st="$2" hours="$3" sd="$BEE_ROOT/sessions/$1"
  mkdir -p "$sd"
  jq -cn --arg s "$st" '{status:$s, attempt:0, needs_human:false}' > "$sd/meta.json"
  jq -cn '{type:"result", subtype:"success", total_cost_usd:0.2, num_turns:3}' > "$sd/run.jsonl"
  echo '{"id":"x"}' > "$sd/session.json"
  touch -d "$hours hours ago" "$sd/run.jsonl"
  : > "$BEE_RUNTIME/$id.in"
}

ID_FORGOTTEN=dddddddd-0000-4000-8000-000000000001  # running, idle 30h -> must stop
ID_WAITING=dddddddd-0000-4000-8000-000000000002    # running, idle 5h -> waiting on a person, LEAVE IT
ID_CORPSE=dddddddd-0000-4000-8000-000000000003     # meta running but the unit is dead, idle 30h
ID_DONE=dddddddd-0000-4000-8000-000000000004       # finished, idle 99h -> leave it

meta() { jq -r "$2" "$BEE_ROOT/sessions/$1/meta.json"; }

# --- 1. The 24h default: stop the forgotten, leave the waiting -------------
make_session_dir "$ID_FORGOTTEN" running 30
make_session_dir "$ID_WAITING"  running 5
make_session_dir "$ID_DONE" done    99
bash "$DAY/../bin/reaper.sh" >/dev/null 2>&1 || true

grep -q "$ID_FORGOTTEN" "$RIG_STOP_LOG" \
  && kq ok "idle 30h over a 24h ceiling: stop was called" \
  || kq no "idle 30h and nothing stopped it"
[[ "$(meta "$ID_FORGOTTEN" '.reason // empty')" == *"idle over"* ]] \
  && kq ok "meta carries the reason ($(meta "$ID_FORGOTTEN" '.reason'))" \
  || kq no "meta does not say why (reason=$(meta "$ID_FORGOTTEN" '.reason // empty'))"
[[ "$(meta "$ID_FORGOTTEN" '.needs_human')" == "false" ]] \
  && kq ok "no needs_human — being forgotten is not a fault a person must fix" \
  || kq no "needs_human pinned on a session that was merely forgotten"
grep -qi "idle\|continue" "$BEE_ROOT/sessions/$ID_FORGOTTEN/run.jsonl" \
  && kq ok "the owner reads WORDS in the live view, and how to come back" \
  || kq no "stopped in silence — no lifecycle line explains it"

grep -q "$ID_WAITING" "$RIG_STOP_LOG" \
  && kq no "a session idle only 5h WAS STOPPED — that is the old 6h bug" \
  || kq ok "idle 5h (waiting on a person): untouched"
grep -q "$ID_DONE" "$RIG_STOP_LOG" && kq no "a finished session was stopped again" || kq ok "finished session: untouched"

# --- 2. The clock restarts at the LAST event, not the first ---------------
# Exactly what RuntimeMaxSec cannot do: a session opened 30h ago but spoken to
# an hour ago is still alive.
: > "$RIG_STOP_LOG"
ID_LONG=dddddddd-0000-4000-8000-000000000005
make_session_dir "$ID_LONG" running 1
jq -cn --arg t "$(date -u -d '30 hours ago' +%Y-%m-%dT%H:%M:%SZ)" \
  '{status:"running", started_at:$t}' > "$BEE_ROOT/sessions/$ID_LONG/meta.json"
touch -d "1 hour ago" "$BEE_ROOT/sessions/$ID_LONG/run.jsonl"
bash "$DAY/../bin/reaper.sh" >/dev/null 2>&1 || true
grep -q "$ID_LONG" "$RIG_STOP_LOG" \
  && kq no "open 30h, active 1h ago, and stopped — still counting from the FIRST event" \
  || kq ok "open 30h, spoken to 1h ago: alive (counted from the LAST event)"

# --- 3. A corpse belongs to the reap branch, not the idle branch ----------
: > "$RIG_STOP_LOG"
make_session_dir "$ID_CORPSE" running 30
RIG_DEAD="$ID_CORPSE" bash "$DAY/../bin/reaper.sh" >/dev/null 2>&1 || true
[[ "$(meta "$ID_CORPSE" '.status')" == "failed" && "$(meta "$ID_CORPSE" '.reason')" == "reaped" ]] \
  && kq ok "dead unit: booked as reaped, not labelled idle" \
  || kq no "corpse mislabelled (status=$(meta "$ID_CORPSE" '.status') reason=$(meta "$ID_CORPSE" '.reason'))"

# --- 4. SESSION_IDLE_H=0 turns the ceiling OFF, not 'stop everything' -----
: > "$RIG_STOP_LOG"
make_session_dir "$ID_FORGOTTEN" running 99
SESSION_IDLE_H=0 bash "$DAY/../bin/reaper.sh" >/dev/null 2>&1 || true
[[ -s "$RIG_STOP_LOG" ]] && kq no "SESSION_IDLE_H=0 stopped everything instead" || kq ok "SESSION_IDLE_H=0: ceiling off"

# --- 5. The ceiling is configurable: at 1h, a 5h-idle session must stop ---
: > "$RIG_STOP_LOG"
make_session_dir "$ID_WAITING" running 5
SESSION_IDLE_H=1 bash "$DAY/../bin/reaper.sh" >/dev/null 2>&1 || true
grep -q "$ID_WAITING" "$RIG_STOP_LOG" \
  && kq ok "SESSION_IDLE_H=1: the ceiling really is read from config" \
  || kq no "changing SESSION_IDLE_H had no effect"

echo
if [[ $FAIL == 0 ]]; then echo "RIG-19: ALL GREEN"; else echo "RIG-19: RED"; exit 1; fi
