#!/usr/bin/env bash
# ─── v2 balance tuner driver — crash-resilient chunked runner ────────────────
#
# The simulated-annealing pool tuner (scripts/v2-tune.ts) is CPU-bound and trips
# a nondeterministic V8 codegen crash (exit 139) on long single-process runs —
# Node 24, both Maglev and TurboFan, even --no-opt. Rather than fight the VM we
# run the search in SHORT chunks, each a fresh `node` process that loads/saves
# state to disk, and RETRY any chunk that crashes (deterministic resume → a retry
# just re-rolls the heisenbug). Net effect: a reliable long search.
#
# Usage:  bash scripts/v2-tune.sh [TOTAL_ITERS] [CHUNK] [GAMES] [VALIDATE] [SEED]
# Default: 240 iters in chunks of 15, 70 games/combo (search), 700 (validate).

set -u
cd "$(dirname "$0")/.."

BUNDLE="${TMPDIR:-/tmp}/v2tune.mjs"
STATE="${TMPDIR:-/tmp}/v2tune-state.json"
TOTAL="${1:-240}"
CHUNK="${2:-15}"
GAMES="${3:-70}"
VALIDATE="${4:-700}"
SEED="${5:-1}"

echo "bundling tuner → $BUNDLE"
npx esbuild scripts/v2-tune.ts --bundle --platform=node --format=esm --outfile="$BUNDLE" >/dev/null 2>&1 \
  || { echo "esbuild bundle failed"; exit 1; }
rm -f "$STATE"

run_chunk() { # $1 = global start iteration
  local start="$1" attempt code
  for attempt in $(seq 1 10); do
    node --no-opt "$BUNDLE" --resume="$STATE" --start="$start" --total="$TOTAL" \
         --iters="$CHUNK" --games="$GAMES" --seed="$SEED"
    code=$?
    [ "$code" -eq 0 ] && return 0
    echo "  (chunk @$start crashed [exit $code] — retry $attempt)"
  done
  echo "chunk @$start failed after 10 retries"; return 1
}

start=0
while [ "$start" -lt "$TOTAL" ]; do
  run_chunk "$start" || exit 1
  start=$((start + CHUNK))
done

echo ""
echo "── final validation (best of search) ──"
node --no-opt "$BUNDLE" --resume="$STATE" --report --validate="$VALIDATE" --games="$GAMES" --seed="$SEED"
