# Backend selftest — Agent Canvas 控制面 (Hono + herdr)

日期：2026-09-22 ｜ 分支：backend-cp ｜ 运行方式：`node dist-api/index.js`（production 构建产物，tsx 路径同样验证过）

环境：herdr 0.9.1（repo 内 `bin/herdr`，server 由 API 进程自动拉起，`bin/herdr server` detached，socket ~/.config/herdr/herdr.sock）。

## 1. POST /api/graph/run → 真实 pane 创建并跑脚本

```
$ curl -X POST localhost:3000/api/graph/run
{"ok":true}
# 2s 轮询 GET /api/graph：
running n-coord:running n-env:running  n-data:queued n-report:queued n-fail:queued n-chat:queued
running n-coord:running n-env:completed n-data:running n-report:running ...
running n-coord:running n-env:completed n-data:waiting n-report:failed n-fail:completed ...
```

herdr 侧实证（`herdr agent list`）：4 个 pane（w3:p1..p4）各有上报的 agent
（ag-env-01/ag-data-01/ag-report-01/ag-chat-01）；成功节点 report idle（herdr 归一化为 done），
失败节点 report unknown —— 未踩 report_agent 拒绝 done 的坑。

## 2. WS /ws：hello → full-sync；term 快照含 ANSI

```
→ {"type":"hello"} + {"type":"term.subscribe","nodeId":"n-data"}
[0.0s] graph runState=idle nodes=...（全量同步）
[8.1s]  term #1 node=n-data bytes=245 hasAnsiEsc=true
  sample: "\u001b[0m\u001b[1m\u001b[38;5;2mkimi@...$ bash .../report-gen.sh n-report; ..."
[10.0s] node n-data -> waiting approval={"prompt":"将写入 128 条记录"}
[10.1s] edge e-report-fail label=error routed
[11.2s] edge e-coord-env-weak label=6 msg/min      ← 弱链接速率实时更新
[35.4s] graph runState=done ...                    ← run 结束再推一次全量
```

term 仅在内容变化时推送（n-data waiting 期间无新输出 → 不重复推），2Hz 轮询。

## 3. n-data waiting → approve → 完成

```
$ POST /api/nodes/n-data/approval {"decision":"approve"} → {"ok":true}
n-data: waiting → running(approved, resuming) → completed
n-chat: queued → running → completed（弱链接消费 n-data 产物，chat-analysis.sh 输出 ANALYSIS::/INSIGHT:: 结构化行）
终态：done n-coord:completed n-env:completed n-data:completed n-report:failed n-fail:completed n-chat:completed
```

## 4. n-report failed + 错误路由边激活

report-gen.sh 输出若干行后 exit 1 → n-report failed(statusReason='exit 1')；
边 e-report-fail label 变为 'error routed'（edge 补丁广播），n-fail artifact running→completed，
事件流有 `error route n-report -> n-fail activated`。

## 5. POST /api/graph/reset → 干净可重跑

```
{"ok":true} → runState=idle，全节点 queued，边 label 复位 '0 msg/min'，
事件清空（/tmp/canvas-events.jsonl 截断，GET /api/nodes/n-env/events → []），
herdr workspace list → []（含历史泄漏的 agent-canvas workspace 一并关闭）。
reset 后重新 run 全流程复现成功（幂等：running/done 中重复 POST run 为 no-op，需 reset 重跑）。
```

## 附加：reject 路径

`{"decision":"reject"}` → n-data failed('approval rejected') → n-chat 自动 skipped('upstream failed') → run done。

## 附加：POST /api/nodes/:id/input

`{"text":"..."}` → pane.send_input(text+Enter) → {"ok":true}；无 pane 节点返回 400。

## 过程中发现并修复的问题

1. herdr 响应包裹层：`workspace.create`→`{workspace,root_pane}`、`pane.split`→`{pane}`、
   `pane.read`→`{read}`，id 字段为 `workspace_id`/`pane_id` —— adapter 统一归一化。
2. 服务器重启后 /tmp/canvas-run 残留旧 marker 被新一轮 poll 误消费（n-data 被旧的 exit=1 直接判 failed）
   → run 开始时清空 marker 目录；reset 关闭所有 label=agent-canvas 的 workspace。
3. waiting→running 后 approval 字段残留 → 非 waiting 即删除。
4. n-data 失败后 n-chat 永远 queued → 增加 skip 传播（上游 failed/skipped → 下游 skipped）。
