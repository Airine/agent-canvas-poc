#!/usr/bin/env bash
# report-gen.sh — demo agent: report generation that fails deterministically.
# Emits a few lines then exits 1; the coordinator marks the node failed and
# activates the error-routing edge to n-fail.
set -u
NODE_ID="${1:-n-report}"
RUN_DIR="${CANVAS_RUN_DIR:-/tmp/canvas-run}"
mkdir -p "$RUN_DIR"
PROGRESS="$RUN_DIR/$NODE_ID.progress"

echo "[report-gen] collecting metrics from pipeline ..."
sleep 1
echo 0.3 > "$PROGRESS"
echo "[report-gen] rendering template 'weekly-summary.md' ..."
sleep 1
echo 0.6 > "$PROGRESS"
echo "[report-gen] ERROR: template slot 'dataset_ref' unresolved"
echo "[report-gen] ERROR: upstream artifact missing (expected artifact://canvas/dataset/v1)"
echo "[report-gen] fatal: cannot generate report"
exit 1
