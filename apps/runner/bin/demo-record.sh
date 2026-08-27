#!/usr/bin/env bash
# demo-record.sh — record a demo of a REAL Chrome tab, headless, from a session.
#
#   demo-record.sh start <url> <out.webm>   # bridge + Chrome + begin recording
#   demo-record.sh cdp                      # CDP endpoint, for Playwright to drive
#   demo-record.sh caption <text>           # mark a moment
#   demo-record.sh stop                     # encode, and REPORT THE SPEED-UP
#   demo-record.sh down                     # stop Chrome and the bridge
#
# Why this wrapper exists rather than prose in the skill — three things are
# fiddly enough that a person following instructions gets them wrong, and all
# three were measured on 27/08, not guessed:
#
#  1. **Google Chrome stable ignores `--load-extension`.** Verified on 148 with
#     three flag combinations, headless and old-headless: the extension never
#     loads. Chrome FOR TESTING (the one Playwright downloads) does load it.
#     So the binary is discovered, not assumed.
#  2. **`data:` URLs cannot be captured.** `host_permissions: ["<all_urls>"]`
#     does not match that scheme, so capture falls back to `activeTab`, which
#     needs a user gesture that never comes. Only http(s) works.
#  3. **The video is a TIME-LAPSE, and silently so.** The extension asks Chrome
#     for 5 captures a second; Chrome's quota allows about 2
#     (MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND — measured: 18 frames landed,
#     32 refused, in 10s). The encoder is still told 5, so a 10-second
#     recording becomes a 3.6-second video playing 2.8× fast. That is the
#     vendored tool's deliberate design, and it reads as "smooth" rather than
#     as fast — which is exactly why nobody notices. `stop` prints the ratio so
#     it reaches the PR instead of misleading a reviewer about how quickly the
#     app responds.
set -euo pipefail

HERE="$(dirname "$(readlink -f "$0")")"
SKILL="${BEE_RECORD_SKILL:-$HOME/.claude/skills/record-screen}"
[[ -d "$SKILL" ]] || SKILL="$HERE/../skills/record-screen"
RECORD="$SKILL/scripts/record.js"
PROFILE="${BEE_DEMO_PROFILE:-${TMPDIR:-/tmp}/bee-demo-chrome}"
CDP_PORT="${BEE_DEMO_CDP_PORT:-9339}"
STAMP="${TMPDIR:-/tmp}/bee-demo-record.stamp"

err() { printf '%s\n' "$*" >&2; }
die() { err "demo-record: $*"; exit 1; }

# Usage must print without the tool being installed: someone asking "how do I
# call this" should not be told about a missing dependency instead.
case "${1:-}" in
  ""|-h|--help|help) sed -n '3,9p' "$0"; exit 2;;
esac

[[ -f "$RECORD" ]] || die "record-screen not installed at $SKILL — run install.sh"

# The FPS the encoder assumes, read from the vendored tool so this script does
# not become a second source of truth for it.
enc_fps() {
  sed -n 's/^const FPS = \([0-9]*\);.*/\1/p' "$RECORD" | head -1
}

# Chrome that can actually load an unpacked extension. Playwright's build is
# Chrome for Testing, which can; Google Chrome stable cannot (see above).
find_chrome() {
  local c
  for c in "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome \
           "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome; do
    [[ -x "$c" ]] && { printf '%s\n' "$c"; return 0; }
  done
  if command -v google-chrome >/dev/null 2>&1; then
    err "demo-record: WARNING — falling back to google-chrome. Stable Chrome"
    err "  ignores --load-extension (measured on 148), so recording will start"
    err "  and capture nothing. Install Playwright's browser instead:"
    err "  (cd apps/web && npx playwright install chromium)"
    command -v google-chrome
    return 0
  fi
  return 1
}

bridge_up() {
  ss -ltn 2>/dev/null | grep -q ':9234 ' && return 0
  nohup node "$RECORD" serve >"${TMPDIR:-/tmp}/bee-demo-bridge.log" 2>&1 &
  local i
  for i in $(seq 1 40); do
    ss -ltn 2>/dev/null | grep -q ':9234 ' && return 0
    sleep 0.25
  done
  die "bridge did not come up — see ${TMPDIR:-/tmp}/bee-demo-bridge.log"
}

chrome_up() {
  local url="$1" chrome args i
  chrome=$(find_chrome) || die "no Chrome found"
  pgrep -f "user-data-dir=$PROFILE" >/dev/null && return 0
  rm -rf "$PROFILE"; mkdir -p "$PROFILE"
  args=(--headless=new --no-first-run --no-default-browser-check
        --window-size=1280,720 --remote-debugging-port="$CDP_PORT"
        --user-data-dir="$PROFILE"
        --load-extension="$SKILL/extension"
        --disable-extensions-except="$SKILL/extension" "$url")

  # Try with Chrome's own sandbox first. Some hosts (containers, restricted
  # user namespaces) refuse it outright — retry without, and SAY which one,
  # because "it worked" and "it worked unsandboxed" are different facts.
  nohup "$chrome" "${args[@]}" >"${TMPDIR:-/tmp}/bee-demo-chrome.log" 2>&1 &
  sleep 3
  if ! pgrep -f "user-data-dir=$PROFILE" >/dev/null; then
    if grep -q "No usable sandbox" "${TMPDIR:-/tmp}/bee-demo-chrome.log" 2>/dev/null; then
      err "demo-record: this host refuses Chrome's sandbox — retrying with --no-sandbox"
      nohup "$chrome" --no-sandbox "${args[@]}" \
        >"${TMPDIR:-/tmp}/bee-demo-chrome.log" 2>&1 &
      sleep 3
    fi
  fi
  pgrep -f "user-data-dir=$PROFILE" >/dev/null \
    || die "Chrome did not start — see ${TMPDIR:-/tmp}/bee-demo-chrome.log"

  for i in $(seq 1 40); do
    node "$RECORD" status 2>/dev/null | grep -q "EXTENSION: connected" && return 0
    sleep 0.5
  done
  die "the extension never connected — is this Chrome for Testing? ($chrome)"
}

case "${1:-}" in
  start)
    URL="${2:-}"; OUT="${3:-}"
    [[ -n "$URL" && -n "$OUT" ]] || die "usage: demo-record.sh start <url> <out.webm>"
    [[ "$URL" == http://* || "$URL" == https://* ]] \
      || die "only http(s) can be captured — a data: URL is not covered by the extension's host permissions"
    bridge_up
    chrome_up "$URL"
    node "$RECORD" start --tab 1 --out "$OUT"
    date +%s.%N > "$STAMP"
    ;;
  cdp)
    printf 'http://127.0.0.1:%s\n' "$CDP_PORT"
    ;;
  caption)
    shift; node "$RECORD" caption "$*"
    ;;
  stop)
    OUTPUT=$(node "$RECORD" stop)
    printf '%s\n' "$OUTPUT"
    FRAMES=$(sed -n 's/^FRAMES: \([0-9]*\)$/\1/p' <<<"$OUTPUT" | head -1)
    WALL=$(sed -n 's/^DURATION: \([0-9.]*\)s$/\1/p' <<<"$OUTPUT" | head -1)
    FPS=$(enc_fps)
    if [[ -n "$FRAMES" && -n "$WALL" && -n "$FPS" && "$FRAMES" -gt 0 ]]; then
      awk -v f="$FRAMES" -v w="$WALL" -v fps="$FPS" 'BEGIN {
        vid = f / fps;
        if (vid <= 0 || w <= 0) exit;
        printf "VIDEO_SECONDS: %.1f\n", vid;
        printf "CAPTURED_FPS: %.1f\n", f / w;
        printf "SPEEDUP: %.1fx — %.1fs of real time shown in %.1fs\n", w / vid, w, vid;
        print  "SAY THIS IN THE PR: the demo is a time-lapse, not real time.";
      }'
    fi
    rm -f "$STAMP"
    ;;
  down)
    pkill -f "user-data-dir=$PROFILE" 2>/dev/null || true
    pkill -f "record.js serve" 2>/dev/null || true
    rm -rf "$PROFILE" "$STAMP"
    ;;
  *)
    sed -n '3,9p' "$0"
    exit 2
    ;;
esac
