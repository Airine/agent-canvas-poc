#!/usr/bin/env bash
# seed-research.sh — canvas-aware agents for the ws-research seed graph.
# Usage: seed-research.sh <node-id>   (n-search|n-scrape|n-compare|n-summary|n-brief)
#
# Marker protocol (same as scripts/agents/data-process.sh):
#   $CANVAS_RUN_DIR/<node>.progress  — 0..1 progress, polled by the coordinator
#   $CANVAS_RUN_DIR/<node>.outbox    — appended lines become 'message' events
#                                      (drives weak-edge msg/min labels)
#   $CANVAS_RUN_DIR/<node>.blocked   — approval gate; waits on stdin go/abort
# Exit code = node result (the coordinator wrapper records it in <node>.exit).
set -u
NODE_ID="${1:-n-search}"
RUN_DIR="${CANVAS_RUN_DIR:-/tmp/canvas-run}"
mkdir -p "$RUN_DIR"
OUTBOX="$RUN_DIR/$NODE_ID.outbox"
PROGRESS="$RUN_DIR/$NODE_ID.progress"
BLOCKED="$RUN_DIR/$NODE_ID.blocked"

say() { echo "[$NODE_ID] $*"; echo "$NODE_ID: $*" >> "$OUTBOX"; }
prog() { echo "$1" > "$PROGRESS"; }

# Wait for control-plane input on stdin ('go' continues, anything else aborts).
# Bounded so a forgotten approval fails the node instead of hanging forever.
wait_gate() {
  local input=""
  for _ in $(seq 1 300); do
    if read -r -t 1 input; then break; fi
  done
  rm -f "$BLOCKED"
  [ "$input" = "go" ]
}

case "$NODE_ID" in
  n-search)
    say "检索公开资料：3 个竞品 / 官方文档 / 发布日志 ..."
    sleep 1; prog 0.2
    say "命中 27 篇文档，去重后 14 篇"
    sleep 1; prog 0.5
    say "抽取定价 / 功能矩阵 / 集成能力三类事实"
    sleep 1; prog 0.8
    say "检索完成：facts.search.json (14 docs, 41 facts)"
    sleep 1; prog 1.0
    exit 0
    ;;

  n-scrape)
    say "抓取竞品站点：pricing / docs / changelog ..."
    sleep 1; prog 0.25
    say "competitor-a: 12 页抓取完成 (200 OK)"
    sleep 1; prog 0.55
    say "competitor-b: 9 页抓取完成，1 页 429 已重试"
    sleep 1; prog 0.85
    say "抓取完成：raw.scrape/ (21 pages, 3.2 MB)"
    sleep 1; prog 1.0
    exit 0
    ;;

  n-compare)
    say "合并 search/scrape 两路事实，对齐功能维度 ..."
    sleep 1; prog 0.3
    say "生成 5 维度 x 3 竞品对比矩阵"
    sleep 1; prog 0.6

    # --- approval gate ---
    echo "[BLOCKED] waiting approval: 确认对比矩阵结论后进入纪要撰写"
    echo "确认功能对比矩阵结论（5 维度 x 3 竞品）" > "$BLOCKED"
    say "blocked, waiting for human approval (go/abort)"

    if wait_gate; then
      say "结论已确认，固化对比报告 compare.md"
      sleep 1; prog 0.9
      say "对比分析完成：compare.md (5 dims, 2 个差异化结论)"
      sleep 1; prog 1.0
      exit 0
    else
      say "审批被拒/超时，放弃本轮对比结论"
      exit 1
    fi
    ;;

  n-summary)
    say "基于 compare.md 撰写调研纪要 ..."
    sleep 1; prog 0.3
    say "纪要骨架：背景 / 矩阵 / 结论 / 建议"
    sleep 1; prog 0.7
    say "调研纪要完成：brief.md -> artifact://canvas/research/brief"
    sleep 1; prog 1.0
    exit 0
    ;;

  n-brief)
    say "简报问答就绪，预载检索事实 (weak consume: n-search/n-summary)"
    sleep 2; prog 0.4
    say "预答：差异化结论 2 条已索引，可追问定价与集成"
    sleep 2; prog 0.8
    say "briefing session closed (PoC auto-answer)"
    prog 1.0
    exit 0
    ;;

  *)
    echo "[seed-research] unknown node id: $NODE_ID" >&2
    exit 2
    ;;
esac
