#!/usr/bin/env bash
# data-process.sh — demo agent: data processing with a human approval gate.
# Mid-run it reports blocked (marker file + [BLOCKED] output line) and waits
# on stdin: 'go' continues, 'abort' fails. Exit code = node result.
set -u
NODE_ID="${1:-n-data}"
RUN_DIR="${CANVAS_RUN_DIR:-/tmp/canvas-run}"
mkdir -p "$RUN_DIR"
OUTBOX="$RUN_DIR/$NODE_ID.outbox"
PROGRESS="$RUN_DIR/$NODE_ID.progress"
BLOCKED="$RUN_DIR/$NODE_ID.blocked"

say() { echo "[data-process] $*"; echo "data: $*" >> "$OUTBOX"; }

say "loading source dataset ..."
sleep 1
echo 0.2 > "$PROGRESS"
say "validated 512 rows, 0 errors"
sleep 1
echo 0.5 > "$PROGRESS"
say "transform stage complete, pending write"

# --- approval gate ---
echo "[BLOCKED] waiting approval: 将写入 128 条记录"
echo "将写入 128 条记录" > "$BLOCKED"
say "blocked, waiting for human approval (go/abort)"

# wait for control-plane input on stdin (timeout keeps demo from hanging forever)
INPUT=""
for i in $(seq 1 300); do
  if read -r -t 1 INPUT; then break; fi
done
rm -f "$BLOCKED"

if [ "$INPUT" = "go" ]; then
  say "approval granted, writing 128 records ..."
  sleep 1
  echo 0.8 > "$PROGRESS"
  say "write committed: 128/128"
  sleep 1
  echo 1.0 > "$PROGRESS"
  say "dataset published -> artifact://canvas/dataset/v1"
  echo "[data-process] done"
  exit 0
else
  say "approval rejected (input='$INPUT'), aborting write"
  echo "[data-process] aborted"
  exit 1
fi
