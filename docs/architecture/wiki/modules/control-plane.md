---
title: 本地控制面
description: HTTP、WebSocket 与工作区持久化的共同边界。
sources:
  - app/api/index.ts fb665635c747
  - app/api/routes.ts 8727ff4c9a19 wireBroadcasts wsHandlers api
  - app/api/registry.ts 4ccc91d72dac registry
  - app/api/graph.ts 112b00eb033d GraphStore onAnyPatch
  - app/api/layout.ts 4db5586b7967 computeLayout
  - app/api/local-access.ts 160bda3f88d5 localRequestAllowed
  - app/api/runtime-router.ts 16802d8055c1 requireHerdr runtimeRouter
  - app/api/types.ts 76c3fb554487 CanvasNode ServerMessage ClientMessage
  - app/api/workspace-paths.ts d251249d59c7 PROJECT_ROOT migrateLegacySeedPath
covers:
  - app/api/index.ts
  - app/api/routes.ts
  - app/api/registry.ts
  - app/api/graph.ts
  - app/api/layout.ts
  - app/api/local-access.ts
  - app/api/runtime-router.ts
  - app/api/types.ts
  - app/api/workspace-paths.ts
  - app/api/graphs/
---

# 本地控制面

## 职责

控制面把浏览器操作交给相应后端，保存工作区和画布坐标，再把变化推回当前工作区的订阅者。真实 Agent 会话与旧版终端编排共用入口，但不能互相调用对方的运行控制。服务只监听本机地址，并检查请求的目标主机和浏览器来源。

工作区记录与画布状态由服务管理。会话消息由独立的运行时模块保存，画布只投影会话身份和状态；它不是会话历史的事实源。

## 对外接口

- `app/api/index.ts` 挂载 `/api`、升级 `/ws`，并托管 `app/dist/`。静态文件不存在时回退到首页；尚未构建首页则返回 404。
- `app/api/routes.ts` 的 `api` 提供工作区创建、查询、重命名、归档、布局及后端控制。`/api/e/*` 已退役，返回 410。旧 `/api/graph` 与 `/api/nodes/:id/*` 仍按活动工作区解释，新调用应使用 `/api/workspaces/:wid/...`。
- `wsHandlers` 接收 `hello`、`term.subscribe`、`term.unsubscribe`。`hello` 切换工作区时清理旧终端订阅，并重置 `generation` 与 `sequence`。发送内容包括完整图、节点或边补丁、会话、事件和终端快照；消息契约见 `app/api/types.ts`。
- `app/api/registry.ts` 的 `registry` 管理工作区，默认写入 `app/api/data/workspaces.json`，可通过 `CANVAS_DATA_DIR` 改位置。写入采用临时文件后重命名。首次无有效记录时从 `app/api/graphs/` 的 JSON 示例初始化。
- `app/api/graph.ts` 的 `GraphStore` 管理单个工作区的图；`onAnyPatch` 供广播订阅。`app/api/layout.ts` 的 `computeLayout` 使用最长路径分层和重心排序，不调用 dagre。所有可见边（含真实通信边）都参与布局，归档节点被排除，Zone 不决定列。
- `localRequestAllowed` 限制本机 Host 与允许端口；`runtimeRouter` 与 `requireHerdr` 拒绝对真实会话工作区执行旧版图运行和终端输入。实现分别在 `app/api/local-access.ts`、`app/api/runtime-router.ts`。

## 数据怎么流

创建工作区时，入口先校验字段，再根据后端决定初始画布。真实会话工作区固定使用项目根目录和空图；旧版终端工作区必须提供图。保存成功后，浏览器取得工作区标识。后续读取会更新内存中的活动工作区，旧版兼容入口也随之改变目标。

浏览器建立长连接后先选择工作区，服务返回完整画布；真实会话工作区还会收到每个会话的当前视图。节点变化只发给订阅该工作区的连接。拖动布局会先验证全部坐标和节点，再逐个更新并持久化。自动布局沿用同一补丁广播路径。

重启时，旧版终端图会清理进程标识、进度和运行状态，避免把已经结束的进程当成仍在运行。真实会话图则根据持久化会话视图重新投影。归档先标记只读，再停止该工作区下的真实会话；不删除历史。上述处理分别见工作区注册表与路由的启动广播接线。

协作记录由会话管理器发出通信变化事件，路由将其投影为边补丁；重启先重建会话节点，再从独立账本重建通信边。没有公开的跨 Agent 发送 HTTP 接口，身份绑定走私有 worker 通道，见 [Canvas 协作](collaboration.md)。

## 改动指南

改请求字段先看 `app/api/routes.ts` 的 Zod schema，再核对 `app/api/types.ts` 和调用方。新增写接口必须检查工作区归属、后端类型及 `registry.assertWritable`；停止会话允许用于已归档工作区，以便收尾。

新增广播使用明确的 `workspaceId`。事件生产者直接记录 `workspaceId`，广播使用该归属，REST 历史与消息速率同时按工作区和节点过滤。兼容 `/nodes/:id/events` 限定当前活动工作区，详见[旧版终端编排](herdr.md)。

改存储位置或示例迁移先看 `app/api/workspace-paths.ts`。`PROJECT_ROOT` 不依赖启动目录，`migrateLegacySeedPath` 只迁移三组精确匹配的历史示例，不能批量替换用户路径。API 模块导入会初始化注册表；测试前应先设置独立的数据目录。
