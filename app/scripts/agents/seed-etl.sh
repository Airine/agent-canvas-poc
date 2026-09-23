#!/usr/bin/env bash
# seed-etl.sh — canvas-aware agents for the ws-etl seed graph.
# Usage: seed-etl.sh <node-id>   (n-ext-a|n-ext-b|n-transform|n-load|n-verify)
#
# Marker protocol (same as scripts/agents/data-process.sh):
#   $CANVAS_RUN_DIR/<node>.progress  — 0..1 progress, polled by the coordinator
#   $CANVAS_RUN_DIR/<node>.outbox    — appended lines become 'message' events
#                                      (drives weak-edge msg/min labels)
#   $CANVAS_RUN_DIR/<node>.blocked   — approval gate; waits on stdin go/abort
# Exit code = node result (the coordinator wrapper records it in <node>.exit).
set -u
NODE_ID="${1:-n-ext-a}"
RUN_DIR="${CANVAS_RUN_DIR:-/tmp/canvas-run}"
mkdir -p "$RUN_DIR"
OUTBOX="$RUN_DIR/$NODE_ID.outbox"
PROGRESS="$RUN_DIR/$NODE_ID.progress"
BLOCKED="$RUN_DIR/$NODE_ID.blocked"

say() { echo "[$NODE_ID] $*"; echo "$NODE_ID: $*" >> "$OUTBOX"; }
prog() { echo "$1" > "$PROGRESS"; }

# Wait for control-plane input on stdin ('go' continues, anything else aborts).
wait_gate() {
  local input=""
  for _ in $(seq 1 300); do
    if read -r -t 1 input; then break; fi
  done
  rm -f "$BLOCKED"
  [ "$input" = "go" ]
}

case "$NODE_ID" in
  n-ext-a)
    say "抽取订单库：增量水位 watermark=2024-06-01T00:00:00Z ..."
    sleep 1; prog 0.3
    say "orders: 1280 rows, order_items: 5120 rows"
    sleep 1; prog 0.7
    say "抽取完成：raw/orders/ (6400 rows, 0 冲突)"
    sleep 1; prog 1.0
    exit 0
    ;;

  n-ext-b)
    say "抽取日志流：tail kafka topic app-events ..."
    sleep 1; prog 0.25
    say "消费 3 个 partition，lag=0"
    sleep 1; prog 0.6
    say "events: 8420 rows, dedup 后 8302 rows"
    sleep 1; prog 0.9
    say "抽取完成：raw/events/ (8302 rows)"
    prog 1.0
    exit 0
    ;;

  n-transform)
    say "清洗转换：join orders x events, 标准化时区/币种 ..."
    sleep 1; prog 0.2
    say "清洗完成：剔除 118 条脏数据 (0.8%)"
    sleep 1; prog 0.5
    say "转换完成：dw.fact_orders (14584 rows) 待加载"   # weak edge -> n-verify
    sleep 1; prog 0.8
    say "血缘记录写入 lineage/ (12 transforms)"
    sleep 1; prog 1.0
    exit 0
    ;;

  n-load)
    say "准备加载：dw.fact_orders 14584 rows -> 128 分区 ..."
    sleep 1; prog 0.4

    # --- approval gate: production write ---
    echo "[BLOCKED] waiting approval: 确认写入生产数仓"
    echo "确认写入生产数仓（fact_orders 128 分区 / 14584 行）" > "$BLOCKED"
    say "blocked, waiting for human approval (go/abort)"

    if wait_gate; then
      say "审批通过，执行 MERGE INTO dw.fact_orders ..."
      sleep 1; prog 0.8
      say "加载完成：128/128 分区提交成功"
      sleep 1; prog 1.0
      exit 0
    else
      say "审批被拒/超时，回滚暂存区 stg.fact_orders"
      exit 1
    fi
    ;;

  n-verify)
    say "质量校验：行数 / 空值率 / 分布偏移 ..."
    sleep 1; prog 0.35
    say "行数校验通过：14584 == 14584"
    sleep 1; prog 0.7
    say "空值率 0.02% (< 阈值 0.1%)，分布偏移 PSI=0.03"
    sleep 1; prog 1.0
    say "校验报告：quality/2024-06-02.md -> artifact://canvas/etl/quality"
    exit 0
    ;;

  *)
    echo "[seed-etl] unknown node id: $NODE_ID" >&2
    exit 2
    ;;
esac
