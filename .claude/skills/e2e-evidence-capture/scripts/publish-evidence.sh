#!/usr/bin/env bash
#
# publish-evidence.sh — turn a green Playwright run into a PR evidence block.
#
#   ./publish-evidence.sh --pr 42 --run "$GITHUB_RUN_ID"
#
# Reads test-results/ from the run that just finished, converts each video to
# mp4 + a preview gif, uploads everything to MinIO under a run-scoped prefix,
# and prints the markdown block to stdout (also written to
# test-results/evidence.md).
#
# It REFUSES to publish anything if the run was not fully green — see the
# "Core Rule" section of SKILL.md. That refusal is the whole point of the
# script; do not add a --force flag.
#
# Required env:
#   MINIO_ENDPOINT     e.g. https://minio.example.com
#   MINIO_ACCESS_KEY
#   MINIO_SECRET_KEY
# Optional env:
#   MINIO_PUBLIC_URL   public base URL if it differs from MINIO_ENDPOINT
#   EVIDENCE_BUCKET    default: pr-evidence
#   GIF_MAX_SECONDS    default: 20

set -euo pipefail

PR=""
RUN_ID=""
RESULTS_DIR="test-results"
BUCKET="${EVIDENCE_BUCKET:-pr-evidence}"
GIF_MAX_SECONDS="${GIF_MAX_SECONDS:-20}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr)          PR="$2"; shift 2 ;;
    --run)         RUN_ID="$2"; shift 2 ;;
    --results-dir) RESULTS_DIR="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

die() { echo "publish-evidence: $*" >&2; exit 1; }

[[ -n "$PR"     ]] || die "--pr is required"
[[ -n "$RUN_ID" ]] || die "--run is required"

for cmd in mc ffmpeg jq; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd not found on PATH"
done
for var in MINIO_ENDPOINT MINIO_ACCESS_KEY MINIO_SECRET_KEY; do
  [[ -n "${!var:-}" ]] || die "$var is not set"
done

REPORT="$RESULTS_DIR/results.json"
[[ -f "$REPORT" ]] || die "$REPORT not found — run the suite with the json reporter first"

# ---------------------------------------------------------------------------
# Gate: only a fully green run may be published.
# ---------------------------------------------------------------------------
UNEXPECTED=$(jq -r '.stats.unexpected // 0' "$REPORT")
FLAKY=$(jq      -r '.stats.flaky      // 0' "$REPORT")
SKIPPED=$(jq    -r '.stats.skipped    // 0' "$REPORT")
EXPECTED=$(jq   -r '.stats.expected   // 0' "$REPORT")

if [[ "$UNEXPECTED" != "0" || "$FLAKY" != "0" ]]; then
  die "run was not green ($UNEXPECTED failed, $FLAKY flaky) — fix and re-record, do not publish"
fi
if [[ "$SKIPPED" != "0" ]]; then
  # A skipped AC is an unmet AC. Surfacing it loudly beats a PR that silently
  # claims coverage it does not have.
  echo "publish-evidence: WARNING — $SKIPPED test(s) skipped; those ACs have no evidence" >&2
fi
[[ "$EXPECTED" != "0" ]] || die "no tests ran"

COMMIT=$(git rev-parse --short HEAD)
PREFIX="pr-${PR}/${RUN_ID}"
PUBLIC_BASE="${MINIO_PUBLIC_URL:-$MINIO_ENDPOINT}/${BUCKET}/${PREFIX}"
STAGE="$RESULTS_DIR/.publish"

rm -rf "$STAGE"
mkdir -p "$STAGE"

mc alias set evidence "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null

# ---------------------------------------------------------------------------
# Collect one row per spec: AC id, title, video path.
# Playwright nests suites arbitrarily deep, so recurse.
# ---------------------------------------------------------------------------
SPECS=$(jq -c '
  [ .suites[] | recurse(.suites[]?) | .specs[]?
    | { file:  (.file // ""),
        title: .title,
        ok:    .ok,
        video: ( [ .tests[]?.results[]?.attachments[]?
                   | select(.name == "video") | .path ] | first // "" ) }
  ]' "$REPORT")

COUNT=$(jq 'length' <<<"$SPECS")
[[ "$COUNT" != "0" ]] || die "no specs found in $REPORT"

ROWS=""
FIRST_GIF=""

for i in $(seq 0 $((COUNT - 1))); do
  spec=$(jq -c ".[$i]" <<<"$SPECS")
  file=$(jq  -r '.file'  <<<"$spec")
  title=$(jq -r '.title' <<<"$spec")
  video=$(jq -r '.video' <<<"$spec")

  # e2e/ac-2-expired-token.spec.ts -> ac-2 -> AC-2
  slug=$(basename "$file" | sed -E 's/\.spec\.(ts|js)$//')
  if [[ "$slug" =~ ^(ac-[0-9]+) ]]; then
    ac_slug="${BASH_REMATCH[1]}"
    ac_label=$(tr '[:lower:]' '[:upper:]' <<<"$ac_slug")
  else
    # Spec not named after an AC — still publish it, but it cannot be mapped
    # to a checkbox in the issue.
    ac_slug="$slug"
    ac_label="—"
  fi

  video_cell="_không có_"
  if [[ -n "$video" && -f "$video" ]]; then
    mp4="$STAGE/${ac_slug}.mp4"
    ffmpeg -y -loglevel error -i "$video" \
      -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an "$mp4"

    # Two-pass palette gives a legible gif at a fraction of the naive size.
    gif="$STAGE/${ac_slug}.gif"
    palette="$STAGE/${ac_slug}-palette.png"
    ffmpeg -y -loglevel error -t "$GIF_MAX_SECONDS" -i "$mp4" \
      -vf "fps=10,scale=720:-1:flags=lanczos,palettegen" "$palette"
    ffmpeg -y -loglevel error -t "$GIF_MAX_SECONDS" -i "$mp4" -i "$palette" \
      -lavfi "fps=10,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse" "$gif"
    rm -f "$palette"

    video_cell="[mp4](${PUBLIC_BASE}/${ac_slug}.mp4)"
    [[ -z "$FIRST_GIF" ]] && FIRST_GIF="$ac_slug"
  fi

  # Explicit in-test screenshots: test-results/shots/ac-2-*.png
  shot_cells=()
  shopt -s nullglob
  for shot in "$RESULTS_DIR"/shots/"$ac_slug"-*.png; do
    name=$(basename "$shot")
    cp "$shot" "$STAGE/$name"
    label=$(sed -E "s/^${ac_slug}-//; s/\.png$//" <<<"$name")
    shot_cells+=("[${label}](${PUBLIC_BASE}/${name})")
  done
  shopt -u nullglob

  # Joined by hand: "${arr[*]}" with a multi-char IFS only uses its first char.
  shots_cell="—"
  if [[ ${#shot_cells[@]} -gt 0 ]]; then
    shots_cell="${shot_cells[0]}"
    for ((s = 1; s < ${#shot_cells[@]}; s++)); do
      shots_cell+=" · ${shot_cells[$s]}"
    done
  fi

  ROWS+="| ${ac_label} — ${title} | ✅ pass | ${video_cell} | ${shots_cell} |"$'\n'
done

# ---------------------------------------------------------------------------
# Upload. Everything lands under a run-scoped prefix, so re-runs never
# overwrite the artifacts an earlier review was based on.
# ---------------------------------------------------------------------------
mc cp --quiet --recursive "$STAGE/" "evidence/${BUCKET}/${PREFIX}/" >/dev/null

# ---------------------------------------------------------------------------
# Emit the block. This script never touches the PR itself — attaching is a
# separate step so a failed upload cannot half-update a PR body.
# ---------------------------------------------------------------------------
OUT="$RESULTS_DIR/evidence.md"
{
  echo "<!-- evidence:start -->"
  echo "## Bằng chứng"
  echo
  echo "| AC | Kết quả | Video | Ảnh |"
  echo "|---|---|---|---|"
  printf '%s' "$ROWS"
  echo
  if [[ -n "$FIRST_GIF" ]]; then
    echo "![demo](${PUBLIC_BASE}/${FIRST_GIF}.gif)"
    echo
  fi
  echo "\`${EXPECTED}/${EXPECTED} passed\` · \`không flake\` · run \`${RUN_ID}\` · commit \`${COMMIT}\`"
  echo "<!-- evidence:end -->"
} | tee "$OUT"

echo "publish-evidence: wrote $OUT" >&2
