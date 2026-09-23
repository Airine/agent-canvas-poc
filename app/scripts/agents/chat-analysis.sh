#!/usr/bin/env bash
# chat-analysis.sh — demo chat agent: consumes n-data's product (weak link)
# and prints structured analysis that the frontend can project as dialogue.
set -u
NODE_ID="${1:-n-chat}"
RUN_DIR="${CANVAS_RUN_DIR:-/tmp/canvas-run}"
mkdir -p "$RUN_DIR"
OUTBOX="$RUN_DIR/$NODE_ID.outbox"

msg() { echo "$*"; echo "chat: $*" >> "$OUTBOX"; sleep 1; }

msg "ANALYSIS::begin dataset=artifact://canvas/dataset/v1"
msg "OBSERVATION::rows=128 quality=ok window=last-7d"
msg "INSIGHT::写入吞吐稳定在 ~18 rows/s，无校验错误"
msg "INSIGHT::p95 延迟 240ms，环比 -12%"
msg "RISK::低 — 仅 1 个上游产物依赖"
msg "SUMMARY::数据处理链路健康，建议按周归档"
msg "ANALYSIS::end status=success"
exit 0
