---
title: 系统总览
description: 本地多 Agent 会话工作台
sources:
  - app/src/App.tsx 10682b846ed7 App
  - app/api/index.ts fb665635c747 wireBroadcasts
  - app/api/routes.ts d337b8303f4f applySession wsHandlers
  - app/api/e/session-manager.ts 0eca4df56113 SessionManager
  - app/scripts/e-runtime-worker.mts 640693a1eb1f
  - app/api/coordinator.ts 2f2630aa80fe
---

# 系统总览

## 当前主线

浏览器展示工作区和会话卡片，本地控制面管理工作区，每个真实会话由独立 worker 接入 e 核心与 Pi。消息和审批属于会话系统，画布保存的是位置、分区、身份和状态投影。

`app/src/App.tsx` 的 `/` 是工作区列表，`/canvas/:workspaceId` 是产品画布。新建的文档站是独立工程 `docs-site/`，其 `/` 才是文档 Landing Page；它不替换产品首页，也不读取用户会话内容。

## 进程边界

| 边界 | 职责 | 代码依据 |
| --- | --- | --- |
| 浏览器 | 路由、画布、聊天呈现、本地界面状态 | `app/src/App.tsx`、[画布](modules/canvas.md)、[聊天](modules/chat-ui.md) |
| 本地 Node 控制面 | HTTP / WS、工作区、生命周期与权限路由 | `app/api/index.ts`、`app/api/routes.ts` |
| 会话 worker | 串行执行控制，桥接 e 核心和 Pi，汇报快照 | `app/scripts/e-runtime-worker.mts` |
| 外部 ADE / Pi | 提供核心会话协议、原生会话与模型访问 | worker 从已配置的 ADE 安装动态加载；不在本仓库内实现 |
| herdr 兼容服务 | pane、tab、终端和旧图调度 | `app/api/coordinator.ts`、[herdr 模块](modules/herdr.md) |

控制面监听回环地址，并校验 Host 与 Origin。它是本地工具，不是带多用户身份系统的公网服务。不要为了远程访问直接取消这些检查。

## 两种后端不能混用

e 工作区允许创建真实 Pi 会话、发消息、管理待发、调整模型与思考级别、审批工具、停止与恢复。会话是否可控制，以核心快照中的能力及就绪状态为准。模型列表和原生身份来自运行时，不是 UI 编造。

herdr 工作区保留强、弱、错误边调度与终端输入。控制路由会拒绝在 e 工作区执行旧图运行。e 现在通过 [Canvas 协作](modules/collaboration.md)提供同画布受管的读取、发布与消息发送，实际记录投影成独立通信边；连线仍不触发自动 DAG 调度、建会话或 Git 合并。

`/react-flow`、`/tldraw` 和 `/welcome` 是原型入口。它们可以展示模拟事件，不代表真实后端具备这些编排行为。

## 状态分别放在哪里

工作区注册表保存图、坐标与归档状态；会话管理器另存会话记录、消息、队列及审批状态；协作账本单独保存文本产物、调用回执和通信记录。浏览器通过 HTTP 发命令，通过 WebSocket 接收图和会话变化。单条推送带工作区、连接代次与递增序号，客户端据此拒绝不属于当前状态的旧消息。

会话的核心快照是运行状态依据，画布节点只是投影。服务启动会重新投影持久化会话，避免把旧图中的运行状态误认为还在执行。记录与原生会话路径的具体边界见[e 运行时](modules/e-runtime.md)。

## 阅读依赖图时的限制

静态图使用 oxc 解析当前工作区 JS/TS；自动读取 tsconfig 别名。类型导入保留，因此图上的依赖并不全部等同于运行时调用。模板字符串动态导入的 ADE 与 Pi 不会自动出现，需要结合 worker 的实际调用阅读。零入度文件已逐项列在[入口对账](entrypoints.md)。

所有模块页都记录支撑论断的文件与哈希。哈希变化只能说明需要复核，不能证明业务含义一定变了；该判断仍需读代码。
