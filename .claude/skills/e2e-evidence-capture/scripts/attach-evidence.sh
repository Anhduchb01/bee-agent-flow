#!/usr/bin/env bash
#
# attach-evidence.sh — put the evidence block into a PR body, replacing any
# block that is already there.
#
#   ./attach-evidence.sh --pr 42 [--file test-results/evidence.md]
#
# Kept separate from publish-evidence.sh on purpose: a failed upload must never
# be able to half-update a PR body. Run this only after publish succeeded.
#
# Requires: gh (authenticated), python3.

set -euo pipefail

PR=""
FILE="test-results/evidence.md"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr)   PR="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

die() { echo "attach-evidence: $*" >&2; exit 1; }

[[ -n "$PR" ]] || die "--pr is required"
[[ -f "$FILE" ]] || die "$FILE not found — run publish-evidence.sh first"
command -v gh      >/dev/null 2>&1 || die "gh not found on PATH"
command -v python3 >/dev/null 2>&1 || die "python3 not found on PATH"

BODY_FILE=$(mktemp)
NEW_BODY=$(mktemp)
trap 'rm -f "$BODY_FILE" "$NEW_BODY"' EXIT

gh pr view "$PR" --json body --jq '.body' > "$BODY_FILE"

# Replace every existing block (a body that somehow accumulated more than one
# gets collapsed back to a single current block) or append if there is none.
python3 - "$BODY_FILE" "$FILE" "$NEW_BODY" <<'PY'
import re, sys

body_path, block_path, out_path = sys.argv[1:4]
body  = open(body_path,  encoding='utf-8').read()
block = open(block_path, encoding='utf-8').read().strip()

pattern = re.compile(
    r'<!-- evidence:start -->.*?<!-- evidence:end -->',
    re.DOTALL,
)

if pattern.search(body):
    body = pattern.sub(lambda _: block, body, count=1)
    body = pattern.sub('', body).rstrip()      # drop any stale extras
else:
    body = body.rstrip() + '\n\n' + block

open(out_path, 'w', encoding='utf-8').write(body + '\n')
PY

gh pr edit "$PR" --body-file "$NEW_BODY"
echo "attach-evidence: updated PR #$PR" >&2
