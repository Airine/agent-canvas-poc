---
title: 旧版终端编排
description: herdr 兼容后端的依赖调度、标记协议和终端快照。
sources:
  - app/api/shell.ts 1c56b4a897b0
  - app/api/coordinator.ts 2f2630aa80fe coordinator
  - app/api/herdr-adapter.ts 49bde9f8697c call ensureServer subscribeEvents paneRead
  - app/api/pump.ts 576243a1e843 pump wirePumpToGraph
  - app/api/eventbus.ts 47b4e6ed936c eventbus
covers:
  - app/api/coordinator.ts
  - app/api/herdr-adapter.ts
  - app/api/pump.ts
  - app/api/eventbus.ts
  - app/api/shell.ts
---

# 旧版终端编排

## 职责

这个兼容后端把一张图映射到本机终端工作区，把分区映射为标签页，把普通节点映射为终端窗格。调度器等待强依赖完成后启动节点，读取命令写出的进度和退出标记，推进图中的成功、失败及跳过状态。

终端画面按需轮询，只有订阅中的节点持续读取。这里执行的是 shell 命令和演示脚本，不是当前真实 Agent 会话的消息与审批系统。

## 对外接口

- `app/api/coordinator.ts` 导出 `coordinator`。`run`、`reset`、`sendInput`、`approve` 分别负责运行、清场、输入和旧版审批；由[本地控制面](control-plane.md)调用。
- `app/api/herdr-adapter.ts` 的 `call` 每次建立一个 Unix socket 连接，交换一行 NDJSON 请求和响应。`ensureServer` 先探活，再尝试启动本地二进制；`HERDR_BIN` 与 `HERDR_SOCKET_PATH` 可覆盖自动发现结果。
- 同文件的 `subscribeEvents` 保持长连接，断开后等待一秒重连。调用方使用归一化后的点分事件名；普通终端输出不经过事件订阅，而由 `paneRead` 读取。
- `app/api/pump.ts` 的 `pump` 按工作区和节点维护订阅，500 毫秒轮询一次可见 ANSI 内容。`wirePumpToGraph` 在节点进入终态后触发末次读取并停止定时器。
- `app/api/eventbus.ts` 的 `eventbus` 保留内存事件，尽力追加到 `CANVAS_EVENTS_LOG`，默认 `/tmp/canvas-events.jsonl`。事件形状是 `{ id, ts, workspaceId, nodeId?, kind, text }`，工作区字段由生产者显式传入，也不在重启时重放文件。

## 数据怎么流

运行请求先建立本地工作区和分区标签页，调度器再寻找依赖已满足的待运行节点。节点启动后，服务报告代理状态，并把包装后的命令送进终端。显式命令优先；没有显式命令时尝试演示脚本，最后退回交互式 shell。协调节点自身不占终端。

包装命令把真实退出码写进运行目录。演示脚本还可写出审批、进度和消息文件。服务每 400 毫秒检查这些文件：审批进入等待状态，进度更新节点，退出码决定成功或失败。失败节点可激活错误处理分支，强依赖失败则向下游传播跳过状态。消息速率每五秒刷新到弱边标签。

浏览器订阅终端后，服务从本地窗格取完整画面；内容改变才向订阅者推送。图状态变化和事件走控制面的广播线路，图完成时保存工作区记录。重置会停止定时器和终端轮询，关闭对应本地窗格及工作区，删除该次运行标记，再恢复初始图。

## 改动指南

调度规则集中在 `app/api/coordinator.ts` 的 `schedule`、`startNode`、`finishNode`、`activateErrorRoutes`、`checkDone`。`ctx.starting` 在异步启动前同步占位，避免多个节点同时结束时重复启动下游；不要把占位挪到异步调用之后。

现有 `n-chat` 等演示节点仍有特殊规则，通用图不应继续扩展这些硬编码。运行目录默认为 `/tmp/canvas-run/<workspaceId>`，可以通过 `CANVAS_RUN_DIR` 改根路径。`app/api/shell.ts` 的 `shellQuote` 和 `exitWrapper` 统一引用路径与节点参数；命令正文仍写入脚本文件，避免双重解释。

`pane.exited` 本身没有退出码，必须优先读 `.exit`。无退出标记的异常关闭同样激活 `activateErrorRoutes`，然后继续调度与完成检查。`handlePaneEvent` 单独处理归一化生命周期事件，可在不启动 herdr 的测试中验证。

`eventbus.forNode` 与 `ratePerMinute` 都要求工作区标识；图状态变化与调度器的生产点同步记录归属。不能再通过节点名猜测事件属于哪个工作区。
