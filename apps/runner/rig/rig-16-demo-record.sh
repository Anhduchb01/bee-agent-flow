#!/usr/bin/env bash
# rig-16 — demo-record.sh: the parts that must be right without a browser.
#
# Chrome, the extension and the capture loop were verified by hand on 27/08
# (Chrome for Testing loads the unpacked extension, Playwright drives the same
# tab over CDP, the last frame shows the destination page). What a rig CAN pin
# is everything around that: the refusals, and the arithmetic that turns a
# recording into an honest sentence about how sped-up it is.
set -uo pipefail
HERE="$(dirname "$(readlink -f "$0")")"
SH="$HERE/../bin/demo-record.sh"

FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d)
export TMPDIR="$T"
mkdir -p "$T/skill/scripts" "$T/skill/extension" "$T/bin"
export BEE_RECORD_SKILL="$T/skill"
export BEE_DEMO_PROFILE="$T/prof"

echo "== 1 · Refusals =="

OUT=$("$SH" 2>&1) && MA=0 || MA=$?
[[ $MA -eq 2 ]] && kq ok "no arguments -> exit 2 with usage" || kq no "expected exit 2, got $MA"

# A missing skill must be named, not discovered later as a confusing failure.
OUT=$("$SH" start http://x/ "$T/o.webm" 2>&1) && MA=0 || MA=$?
grep -q "record-screen not installed" <<<"$OUT" \
  && kq ok "record-screen missing -> says so, and where it looked" \
  || kq no "unhelpful message: $OUT"

# From here on the tool "exists".
printf 'const FPS = 5;\n' > "$T/skill/scripts/record.js"

OUT=$("$SH" start 2>&1) && MA=0 || MA=$?
grep -q "usage: demo-record.sh start" <<<"$OUT" \
  && kq ok "start without url/out -> usage" || kq no "no usage: $OUT"

# Measured 27/08: <all_urls> does not match the data: scheme, so capture falls
# back to activeTab and never fires. Refuse at the door instead of producing an
# empty video and a puzzled reader.
OUT=$("$SH" start "data:text/html,<h1>x</h1>" "$T/o.webm" 2>&1) && MA=0 || MA=$?
[[ $MA -ne 0 ]] && grep -qi "only http" <<<"$OUT" \
  && kq ok "data: URL refused, with the reason" || kq no "data: URL not refused: $OUT"

echo
echo "== 2 · The speed-up sentence =="

# A stub `record.js stop` standing in for a real recording: 18 frames captured
# across 10 seconds of wall clock — the exact numbers measured on 27/08.
cat > "$T/skill/scripts/record.js" <<'EOF'
const FPS = 5;
if (process.argv[2] === "stop") {
  console.log("DURATION: 10.0s");
  console.log("FRAMES: 18");
  console.log("FILE: /tmp/x.webm");
}
EOF

OUT=$("$SH" stop 2>&1)
grep -q "^FRAMES: 18$" <<<"$OUT" \
  && kq ok "passes the tool's own output through untouched" || kq no "swallowed the original output"

# 18 frames encoded at 5fps = 3.6s of video for 10s of real time = 2.8x.
grep -q "VIDEO_SECONDS: 3.6" <<<"$OUT" \
  && kq ok "video length = frames / encoder fps" || kq no "wrong video length: $(grep VIDEO_SECONDS <<<"$OUT")"
grep -q "CAPTURED_FPS: 1.8" <<<"$OUT" \
  && kq ok "reports the fps actually captured, not the one asked for" \
  || kq no "wrong captured fps: $(grep CAPTURED_FPS <<<"$OUT")"
grep -q "SPEEDUP: 2.8x" <<<"$OUT" \
  && kq ok "2.8x — the number a reviewer needs to not misread the demo" \
  || kq no "wrong speedup: $(grep SPEEDUP <<<"$OUT")"
grep -qi "time-lapse" <<<"$OUT" \
  && kq ok "and says plainly it is not real time" || kq no "no time-lapse warning"

# The encoder fps is the vendored tool's constant. Read it, never re-declare
# it: two sources of truth would drift and the ratio would quietly go wrong.
sed -i 's/^const FPS = 5;$/const FPS = 10;/' "$T/skill/scripts/record.js"
OUT=$("$SH" stop 2>&1)
grep -q "VIDEO_SECONDS: 1.8" <<<"$OUT" \
  && kq ok "follows the vendored FPS when it changes (10 -> 1.8s)" \
  || kq no "hardcoded its own fps: $(grep VIDEO_SECONDS <<<"$OUT")"

echo
echo "== 3 · Nothing to divide by =="

cat > "$T/skill/scripts/record.js" <<'EOF'
const FPS = 5;
if (process.argv[2] === "stop") {
  console.log("DURATION: 4.0s");
  console.log("FRAMES: 0");
}
EOF
OUT=$("$SH" stop 2>&1)
grep -q "SPEEDUP" <<<"$OUT" \
  && kq no "invented a ratio from zero frames" \
  || kq ok "zero frames: no ratio invented"

rm -rf "$T"
echo
if [[ $FAIL == 0 ]]; then echo "RIG-16: ALL GREEN"; else echo "RIG-16: RED"; exit 1; fi
