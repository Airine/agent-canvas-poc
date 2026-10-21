---
title: 文档导航
description: 从本地启动到代码边界，找到 Agent Canvas 的实现依据。
baseline: 40d97dabd2903a68e0a219c616f1d82d07acc0e6
sources:
  - app/src/App.tsx 10682b846ed7 App
  - app/api/index.ts d5215586de34 wireBroadcasts
exclude:
  - docs/chat-experience/
  - docs/desktop-chat-evidence/
  - docs/chat-ui-polish-evidence/
  - docs/desktop-chat-experience.md
  - docs/chat-ui-polish.md
  - docs/card-views-and-approvals.md
  - docs/chat-experience.md
  - docs/themes.md
  - docs/canvas-collaboration.md
---

# 文档导航

Agent Canvas 是本地多 Agent 会话工作台。当前分支使用 PI Desktop 原版组件接入 e / Pi，另有 Codex 原版 Webview 接入独立 app-server；React Flow 承载画布，Hono 提供本地控制面。两套原版 UI 都需要独立获取和构建资源，详见仓库中的 `app/native/README.md`。旧自研 UI、herdr 路径与两个画布原型仍保留，但它们的能力不能直接算到原版 UI 适配层上。

## 先找到要做的事

- 第一次运行：[本地启动](getting-started.md)。
- 想了解整体设计：[系统总览](system.md)与[架构地图](../architecture.html)。
- 想追踪请求和事件：[数据流](data-flow.md)与[入口对账](entrypoints.md)。
- 准备修问题：[代码审查](review.md)与[代码体检](health.md)。
- 改完代码要同步文档：[维护流程](maintenance.md)。

## 前端

- [应用入口与主题](modules/frontend-shell.md)
- [工作区画布](modules/canvas.md)
- [聊天界面](modules/chat-ui.md)
- [基础 UI 组件](modules/ui-primitives.md)
- [历史原型与共享视图](modules/prototypes.md)

## 控制面与运行时

- [本地控制面](modules/control-plane.md)
- [e 会话运行时](modules/e-runtime.md)
- [Canvas 协作](modules/collaboration.md)
- [审批与授权](modules/e-approvals.md)
- [消息和附件](modules/message-content.md)
- [herdr 兼容编排](modules/herdr.md)

## 工程与资料

- [开发、测试和运维](modules/development.md)
- [Fumadocs 文档站](modules/documentation.md)
- [调研与实验材料](modules/research.md)
- [目录约定与迁移对照](repository-layout.md)
- [未使用文件逐项复核](unused-files.md)
- [未使用导出逐项复核](unused-exports.md)

## 这份文档的基线

本次整理针对工作区当前内容，包含尚未提交的 e / Pi 功能。baseline 只标记当时的 HEAD，不声称这些改动已提交。每页来源哈希对应实际文件内容，校验不依赖文件是否已经提交。

认领豁免仅用于上方列出的历史聊天验收说明、截图与验收产物；它们保留原位置，不作为架构模块。点文件、锁文件、二进制资产和架构派生目录由校验器自动豁免。研究文档与历史工具的迁移见[目录约定](repository-layout.md)，内容没有按当前实现改写。
