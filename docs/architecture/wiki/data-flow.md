---
title: 数据流
description: 沿浏览器、HTTP、WebSocket、IPC 和工具脚本追踪真实调用。
sources:
  - app/src/App.tsx 10682b846ed7 App
  - app/src/pages/canvas/live-store.ts 056a5d79638a LiveStore
  - app/api/index.ts fb665635c747 wireBroadcasts
  - app/api/routes.ts 7cbd733eaf33 wsHandlers applySession
  - app/api/e/session-manager.ts f1a051ecac53 SessionManager
  - app/scripts/e-runtime-worker.mts 597fd806824d
  - app/scripts/dev-e.mjs 82c22e9d56a3
  - app/api/coordinator.ts 2f2630aa80fe
flows:
  - title: 浏览器入口
    page: data-flow.md#浏览器入口
    steps:
      - from: frontend-shell
        to: canvas
        title: 打开工作区画布
        sources: [app/src/App.tsx]
  - title: 原型入口
    page: data-flow.md#浏览器入口
    steps:
      - from: frontend-shell
        to: prototypes
        title: 独立进入原型路由
        sources: [app/src/App.tsx]
  - title: 创建会话
    page: data-flow.md#会话进程
    steps:
      - from: frontend-shell
        to: control-plane
        title: 创建工作区和会话
        sources: [app/src/pages/home/CreateSessionForm.tsx]
      - from: control-plane
        to: e-runtime
        title: 启动会话进程
        sources: [app/api/routes.ts]
      - from: e-runtime
        to: external-runtime
        title: 建立核心与 Pi 桥接
        sources: [app/scripts/e-runtime-worker.mts]
  - title: WebSocket 推送
    page: data-flow.md#websocket-推送
    steps:
      - from: e-runtime
        to: control-plane
        title: 接收会话变化
        sources: [app/api/routes.ts]
      - from: control-plane
        to: canvas
        title: 推送工作区状态
        sources: [app/api/routes.ts]
  - title: 配置与身份
    page: data-flow.md#配置与身份
    steps:
      - from: chat-ui
        to: canvas
        title: 提交配置变更
        sources: [app/src/pages/canvas/chat/RuntimeConfigControl.tsx]
      - from: canvas
        to: control-plane
        title: 传递版本与幂等意图
        sources: [app/src/pages/canvas/live-store.ts]
      - from: control-plane
        to: e-runtime
        title: 修改后回读配置
        sources: [app/api/routes.ts]
  - title: 发送消息
    page: data-flow.md#发送消息
    steps:
      - from: chat-ui
        to: canvas
        title: 提交会话命令
        sources: [app/src/pages/canvas/chat/Composer.tsx]
      - from: canvas
        to: control-plane
        title: 工作区 HTTP 请求
        sources: [app/src/pages/canvas/live-store.ts]
      - from: control-plane
        to: e-runtime
        title: 校验后交给会话管理器
        sources: [app/api/routes.ts]
      - from: e-runtime
        to: message-content
        title: 校验消息和附件
        sources: [app/api/e/session-manager.ts]
      - from: e-runtime
        to: external-runtime
        title: 通过桥接发送消息
        sources: [app/scripts/e-runtime-worker.mts]
  - title: 审批工具
    page: data-flow.md#审批工具
    steps:
      - from: e-runtime
        to: e-approvals
        title: 观察待审批操作
        sources: [app/api/e/session-manager.ts]
      - from: e-approvals
        to: e-runtime
        title: 复核后提交决定
        sources: [app/api/e/approval-engine.ts]
  - title: 兼容终端
    page: data-flow.md#兼容终端
    steps:
      - from: canvas
        to: control-plane
        title: 订阅终端
        sources: [app/src/pages/canvas/live-store.ts]
      - from: control-plane
        to: herdr
        title: 读取并回传终端快照
        sources: [app/api/routes.ts]
  - title: Agent 协作
    page: data-flow.md#agent-协作
    steps:
      - from: external-runtime
        to: e-runtime
        title: 已审批工具通过私有描述符请求
        sources: [app/scripts/canvas-tools.mjs, app/scripts/e-runtime-worker.mts]
      - from: e-runtime
        to: collaboration
        title: 绑定当前调用与保存通信记录
        sources: [app/api/e/session-manager.ts, app/api/e/collaboration-authorization.ts]
      - from: collaboration
        to: e-runtime
        title: 目标待发队列确认消费
        sources: [app/api/e/collaboration.ts, app/api/e/session-manager.ts]
      - from: collaboration
        to: control-plane
        title: 实际记录投影通信边
        sources: [app/api/routes.ts]
  - title: 启动与退出
    page: data-flow.md#启动与退出
    steps:
      - from: development
        to: control-plane
        title: 启动本地服务
        sources: [app/scripts/dev-e.mjs]
---

# 数据流

## 浏览器入口

`app/src/main.tsx` 装配路由和主题。`/` 读取工作区列表；新建表单先取 `/api/runtime/status`，再提交 `POST /api/workspaces {backend:'e',title}` 与 `POST /api/workspaces/:wid/sessions {title,provider?,model?}`。成功后进入 `/canvas/:wid`。

`/welcome` 介绍旧原型，`/react-flow` 和 `/tldraw` 使用本地事件引擎；这两条路径的数据来自模拟场景，不写真实会话。`/canvas` 负责选择工作区后跳转。文档站 `/`、`/docs/*`、`/api/search` 属于独立的 Next 进程，其数据流见[文档站模块](modules/documentation.md)。

## 控制面入口

`app/api/index.ts` 接受 HTTP 后先校验本机 Host 与 Origin，再挂载 `routes.ts` 的 `/api`。创建工作区经 Zod 校验后写入注册表，保存为数据目录下的 `workspaces.json`，写入使用临时文件后重命名。读取接口返回图、工作区或会话视图；旧 `/api/graph` 使用活动工作区，新功能应明确带工作区 ID。

布局拖动提交 `PATCH /api/workspaces/:wid/layout {positions:[{id,x,y}]}`，校验全部节点后更新图并保存。自动布局调用同一工作区的 `POST .../layout`，经 `computeLayout` 计算坐标再广播。归档先保存只读状态，再停止该工作区的会话。图的持久化与会话记录是不同文件，不能拿前者恢复完整对话。

## 会话进程

会话创建或恢复经 `SessionManager` 启动 worker，IPC `init` 携带运行配置。worker 从 `ADE_ROOT` 动态加载 e 核心与桥接模块，建立 socket、启动 daemon 和 Pi RPC，验证原生会话标识与可用能力。订阅到的核心快照通过 IPC `ready` / `snapshot` 回到父进程。

父进程更新会话记录并发出 `changed`；`routes.ts` 将它投影为画布节点并广播。创建、恢复、停止等生命周期状态持久化到会话记录，原生 Pi 会话文件仍属于 Pi；停机不等于删除历史。

## 发送消息

聊天输入台调用 `LiveStore.sessionAction`，提交工作区内节点的 `/messages`。载荷为 `{intentId,content,attachments,deliverAs}`；附件项包含 `{id,name,mimeType,data}`，其中图片数据是受大小限制的编码内容，不是任意本机文件路径。

控制面确认后端与工作区可写后调用 `SessionManager.control`。管理器校验内容、记录幂等意图，再发 IPC `control`。worker 串行执行控制：读取当前 Pi 状态、预检图片输入、构造内容块，调用 `controlSession` 获取最新能力后发送。

核心 action 与快照回到父进程，写入记录，再经 WebSocket 推送给当前工作区。HTTP 返回“已接受”不代表模型已经回复；结果以核心 action 和会话状态为准。

待发编辑使用 `/queue {mutationId,expectedRevision,operation,itemId,...}`。新增与编辑在提交前验证最终队列的总字节容量，超限不改变队列。管理器保存后在会话就绪时尝试发送。只有核心确认相同幂等键的 action 已应用，队列项才变成已消费；结果未知时暂停，不自动重发。回归入口见[审查记录](review.md)。

## Agent 协作

启动前 API 生成期望 manifest，worker 独立比对并显式加载 Skill 与扩展。私有 hello/welcome 核验实际 Skill 发现、四工具注册、系统指令绑定与版本/摘要；只有完整证据使 collaboration ready。资源漂移、断线或不兼容撤销协作，不自动重试，不阻断普通聊天。只读包检查器不是控制入口。

`canvas-tools.mjs` 在 Pi 注册四个工具。`canvas-adapter.mjs` 生成只扩展审批名单的本地适配器；批准后，工具发送 `{toolCallId,tool,args}` 到不可被子工具继承的私有 FD，worker 转成父 IPC `collaboration`。父进程从自己的 worker 绑定选择来源，`authorizeCollaboration` 对照 e 快照核验正在运行的完整工具与已批准记录。

`CollaborationStore.execute` 解析同画布 hash 引用；读取返回文本来源和 SHA-256，发布保存不可变产物，发送将带受管 origin 的消息加入目标队列。操作意图先落盘，回执和内容签名防重；未知不重放。`SessionManager.changed` 根据实际 queue/action 更新记录状态，`applyCommunications` 使用 `GraphStore.upsertEdge` 发工作区边补丁。API 重启按账本重新投影，而不是依赖旧图充当事实源。

浏览器复制和补全仅插入 `@"名字"#hash`，没有直接投递路径；Agent 可选择不调用任何工具。最新回复按消息时间，不按重放数组顺序。来源恢复只用先前真实关联的同 native、时间和完整内容摘要唯一匹配。详见 [Canvas 协作](modules/collaboration.md)。

## 配置与身份

昵称更新提交 `PATCH .../session {title,expectedVersion}`，只改变应用显示名称。模型与思考级别走 `/configuration`：父进程验证 revision，worker 在空闲检查和串行锁内修改，再从 Pi 回读实际配置，确认原生身份未变后更新状态。原生身份、显示昵称和短标识不能互相替代。

## 审批工具

手工批准/拒绝通过工作区内节点的 `/approval`，携带幂等意图与审批 ID。自动模式由会话变化触发 `ApprovalEngine.observe`，先绑定具体参数和摘要，再跑硬规则或独立审查。提交前重查会话代次、参数摘要与当前规则，最终仍由 worker 的 `bridge.resolveApproval` 执行。

精确授权要求完整参数、摘要匹配和风险确认。停止会话、人工介入或切换模式会取消旧审查，不能让过期决定跨会话代次生效。辅助审批路径拒绝任一层符号链接及父目录跳转，修复与预检边界见[代码审查](review.md)。

## WebSocket 推送

升级 `/ws` 后，浏览器发送 `hello {workspaceId}`。服务先清理这个连接的旧订阅，再返回 `graph` 与 e 会话视图。消息包含 `workspaceId`、`generation` 和单连接递增 `sequence`，客户端按范围和代次消费。

图变化、会话变化和兼容事件分别通过 `onAnyPatch`、`eSessions.changed`、事件总线进入 `wireBroadcasts`。广播只发给选中工作区的连接；兼容事件本身包含工作区 ID，历史查询与消息速率也按工作区隔离。

## 兼容终端

herdr 的 `/run` 经 `requireHerdr` 检查后进入 coordinator。它创建 workspace/tab/pane，将命令发到 herdr socket。shell wrapper 写退出标记，脚本可写阻塞、进度与 outbox 标记；400 ms 轮询据此推进图状态，最终持久化图。

浏览器 `term.subscribe` 交给 pump，500 ms 读取 pane，回传 `term {nodeId,ansi,workspaceId}`。断开连接清理该连接的订阅。前端重连或序号缺口重新 hello，在完整图到达后恢复仍活跃的 herdr 订阅；e 不走终端恢复。旧版审批通过 pane 输入 `go` 或 `abort`，与 e 工具审批协议不同。

## 启动与退出

`dev-e.mjs` 读取本机环境文件、检测端口，再启动 API 与 Vite；生产模式只启动已构建 API，托管静态 UI。启动器请求 `/api/runtime/status` 确认接线，退出时转发信号并在超时后清理子进程。

API 收到 SIGINT / SIGTERM 时关闭 HTTP / WebSocket，再关闭会话管理器。worker 收到停止请求后断开桥接与 socket，终止 Pi 与 daemon。此处是进程内清理，不存在另一个后台定时服务。

## 历史工具

`app/scripts/agents/*.sh` 由示例图的 herdr 节点命令触发，读写协调器约定的标记目录。`tools/legacy/spike/*.py` 显式连接 Unix socket，以换行 JSON 发送 RPC 并采集事件。`tools/legacy/render-preview/` 的 Python/JS 脚本连接已运行的 HTTP / WS 服务，轮询图或终端并输出验收信息；部分会启动、重置或自动批准任务，不能当只读探测随意执行。

测试文件由 Node test / Playwright 调用，配置文件由构建工具加载；它们不是独立产品服务。逐项分类见[入口对账](entrypoints.md)。
