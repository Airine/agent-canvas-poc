# Plan: Agent Canvas 产品化 v0（herdr 接入）

## 已确认决策
- 画布引擎：React Flow（用户拍板）
- 形态：单机自用优先，架构预留团队化；herdr 之上的独立 Web 产品
- 里程碑：先 spike（已完成）→ 操作节点+编排图闭环 → 后续三类节点全量
- herdr 0.9.1 已装于 /home/kimi/bin/herdr；沙箱无真实 LLM CLI，v0 用 shell 任务 agent + `pane.report_agent` 上报生命周期

## Spike 结论（/mnt/agents/output/spike/REPORT.md）
- socket API 103 方法可用；一请求一连接；事件订阅长连接正常
- 活窗：无输出流订阅 → pane.read 轮询（ansi 全量快照，2–5Hz，RTT ~1ms）
- 状态：事件驱动（agent_status_changed/exited）+ pane.report_agent 外部上报
- 坑：report_agent 拒绝 done（映射 idle→done）；events.wait 仅支持 agent status

## 架构
```
React Flow Canvas（改造现有 PoC 的 /react-flow 路由 → /canvas）
   ↕ HTTP + WebSocket
Control Plane（Hono server，backend graft）
 ├─ herdr-adapter.ts：NDJSON 客户端（每请求新连接）+ 订阅长连接 + 断线重连
 ├─ pump.ts：pane.read 轮询泵（2Hz，仅活跃节点）→ WS 推 ansi 快照
 ├─ graph.ts：图模型（节点/强弱链接/依赖）+ 状态机（六态映射）
 ├─ coordinator.ts：编排 driver（按图 spawn pane → 下发命令 → wait 状态 → 推进下游）
 ├─ eventbus.ts：append-only 事件日志（内存+文件），归一化 herdr 事件
 └─ routes.ts：REST（图 CRUD/节点输入/approval）+ WS（状态/画面/事件）
   ↕ NDJSON socket
herdr server（本机，server 自动 spawn 若未运行）
```

## 状态映射（herdr → 六态）
working→running；blocked→waiting(approval)；done→completed；pane.exited≠0→failed；图级：queued/skipped 由控制面补齐

## v0 演示场景（真实 herdr 驱动）
Coordinator 根节点 → 强依赖 3 个子节点：
1. op「环境初始化」：真实 pane 跑构建式 shell 脚本（多行输出）
2. op「数据处理」：真实 pane 跑带进度脚本，中途 report_agent blocked → 画布 approval → 批准后续跑
3. chat「分析汇报」：pane 跑格式化输出脚本，控制面解析为对话投影（v0 简化）
弱链接：节点 1→3 通信虚线（消息事件流）；失败分支：一个必失败脚本 → failed + 错误路由边

## Stage
- S1 后端：backend graft + herdr adapter + 控制面 API（coder agent A）
- S2 前端：画布改造接真实数据（coder agent B，依赖 S1 的 API 契约——契约先行写入 plan）
- S3 集成构建 + dynamic 交付
