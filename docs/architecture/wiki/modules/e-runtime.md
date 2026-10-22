---
title: e 会话运行时
description: 会话从持久化记录启动独立工作进程，经 e-core 与 Pi 执行，再把可核验快照送回画布。
sources:
  - app/api/e-adapter.ts e4029903d0d7 eSessions SessionManager
  - app/api/e/config.ts 9cf2024e1ea2 runtimeConfig runtimeStatus MAX_SESSIONS
  - app/api/e/session-manager.ts 42f937409e41 SessionManager eSessions
  - app/api/e/message-queue.ts 035004c14654 mutateQueue reconcileQueue queueReady
  - app/api/e/projection.ts 2eaada3dde64 projectSession
  - app/scripts/e-runtime-worker.mts 640693a1eb1f control publish init
  - app/scripts/e-configuration.mjs 7ae7bdbb1b77 readConfiguration assertIdle changeConfiguration
  - app/scripts/e-control.mjs ed63498cbe6f controlSession
covers:
  - app/api/e-adapter.ts
  - app/api/e/config.ts
  - app/api/e/session-manager.ts
  - app/api/e/message-queue.ts
  - app/api/e/projection.ts
  - app/scripts/e-runtime-worker.mts
  - app/scripts/e-configuration.mjs
---

# e 会话运行时

## 职责

这一层管理真实会话的创建、停止、恢复、归档和删除。归档会停止 worker 并从画布隐藏；删除只接受已归档会话，并删除本地会话目录。每个运行中的会话都有独立工作进程；工作进程连接外部 ADE 检出目录里的 e-core，再启动 Pi。仓库负责进程编排、消息发送和状态投影，模型执行与核心事件归约由外部运行时承担。

会话记录保存在本地。API 重启后会保留历史状态，但不会自动重启模型进程，也不会自动重发结果未知的消息。待发队列需要用户明确恢复，自动审批授权也会清空。实现依据是 `app/api/e/session-manager.ts` 的加载、持久化和启动路径。

## 对外接口

- `app/api/e-adapter.ts` 是兼容导出层，公开 `eSessions`、`SessionManager`、`runtimeStatus` 和 `projectSession`。
- `SessionManager` 提供 `create`、`list`、`get`、`rename`、`stop`、`resume`、`archive`、`deleteArchived`、`control`、`queue`、`configuration` 与 `close`；状态变更通过 `changed` 事件发布完整 `SessionView` 副本。
- `control` 接受 `messages`、`abort` 或 `approval`，使用 `intentId` 保存请求签名与结果。同一标识不能用于不同请求；超时记为结果未知，不自动重试。
- `mutateQueue` 处理待发消息的增加、修改、删除、移动和暂停恢复。`reconcileQueue` 用运行时动作记录确认消费，`queueReady` 决定是否可以继续派发。
- `runtimeConfig` 读取 `ADE_ROOT`、`PI_BIN` 和项目目录。`runtimeStatus` 检查外部模块接口、Pi 版本与模型目录，结果缓存 15 秒。并发会话默认上限为 4，可由 `CANVAS_MAX_SESSIONS` 调整至 1–8。上限只约束正在运行/启动的 worker，归档或停止后的记录不占额度；`sessionLifecycleVersion=2` 让前端识别当前 API 是否支持归档/删除入口。
- 工作进程只接收父进程 IPC。`init` 启动运行时，`control` 处理消息和控制请求，`publish` 发出快照；这不是供浏览器直接调用的公共服务。

## 数据怎么流

创建会话先分配原生会话标识并写下记录，再检查运行环境和并发额度。归档先暂停队列并停止 worker，保留记录；恢复会清除归档标记并重新启动同一 native session，恢复失败会把失败状态带回画布。删除要求已归档、无 worker，并校验目录仍在数据根下后才移除。随后父进程启动工作进程，把项目目录、数据目录和模型选择交给它。工作进程建立本地连接，将有限权限通过继承的文件描述符交给核心进程和 Pi。只有两边确认同一个原生会话、消息发送能力已就绪，父进程才把会话标为可用。

发送消息先在父进程校验正文和附件，再持久化发送意图。工作进程重新读取模型状态，普通下一轮消息还要确认运行器空闲；图片会额外检查是否能原样交给 Pi。控制适配层读取最新能力与版本后提交动作。核心事件经订阅桥汇成快照，父进程更新记录、发布状态，再尝试消费下一条待发消息。附件规则见[共享内容合同](message-content.md)，审批分支见[审批与权限](e-approvals.md)。

待发消息从暂停状态开始，明确授权后才会自动发送。HTTP 或 IPC 返回成功不等于模型已经收到消息；队列还会等待核心动作变成已应用。重启前处于派发或已提交状态的消息会改为结果未知，队列冻结，避免重复发送。

切换配置前，父进程检查版本和正在进行的操作；工作进程再次检查空闲状态。模型切换走核心授权接口，思考级别走受限的 Pi 配置通道，最后回读实际配置。会话投影只提供画布兼容颜色与摘要，不能据此推断某一轮执行成功。

协作工具通过额外的私有文件描述符与父进程 IPC 接入，调用来源绑定当前 worker，并等待 e 中已批准、参数一致的运行中工具证据。消息仍进入现有队列，不额外实现运行器。API、worker、扩展通过版本化 manifest 与私有握手确认包、Skill 发现、四工具及系统指令绑定；旧 API 或版本不兼容只停用协作，普通聊天继续。服务重载后需要显式恢复会话才加载新工具；不会热注入已有 Pi 进程。详见 [Canvas 协作](collaboration.md)。

## 改动指南

- 先读 `app/api/e/session-manager.ts` 的 `launch`、`changed`、`control` 和 `dispatchQueue`，再看 `app/scripts/e-runtime-worker.mts`。不要把本地请求成功改写成已消费；消费判定在 `reconcileQueue`。
- 默认数据位置是 `app/api/data/e/<nodeId>/`，可由 `CANVAS_DATA_DIR` 改写根目录。`record.json` 采用临时文件加重命名；工作进程另存 Pi 会话、控制日志和每次启动的核心状态。恢复时必须找到原始 Pi 会话文件，找不到会拒绝启动。
- `app/scripts/e-control.mjs` 的 `controlSession` 会检查能力是否权威且未过期，并在 `STALE_STATE` 时重新取一次控制依据。新增控制操作必须同时检查父进程、IPC 白名单和核心授权，不能增加任意 RPC 透传。
- 配置与发送的互斥由父进程操作集合和工作进程串行锁共同实现。修改 `changeConfiguration` 时保留原生会话身份检查、空闲检查与最终回读。
- `projectSession` 保留已有坐标和分区，只截取最新助手文本的末尾 600 字作为摘要。会话生命周期、运行状态和画布颜色是不同字段。
- 新增与编辑均先暂存改动，再检查最终序列化队列的 UTF-8 字节数不超过 32 MiB；新增另限 20 条 pending。拒绝不会改变原队列、版本或授权；仍在派发的条目保留对象身份，避免丢失异步状态回写。
