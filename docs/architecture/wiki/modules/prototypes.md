---
title: 画布原型与共享呈现
description: 两套本地演示及产品画布复用的显示组件。
sources:
  - app/src/shared/card-view-preferences.ts 786286221b1b GlobalCardViewPreferences GLOBAL_CARD_VIEW_KEY
  - app/src/shared/NodeShell.tsx 27c6bff70573 NodeShell compactHeader headerActions
  - app/src/pages/reactflow/index.tsx ff659ad06608 ReactFlowPage EventEngine
  - app/src/pages/tldraw/TldrawPage.tsx 82667d254c67 TldrawPage EventEngine
  - app/src/shared/mock/engine.ts b0b754204342 EventEngine buildSnapshot
  - app/src/shared/ViewModeManager.ts 7298339d7c1d ViewModeManager modeForScreenWidth
  - app/src/shared/FocusOverlay.tsx a60114c77b42 FocusOverlay
  - app/src/pages/canvas/collaboration-demo/model.ts c941724956b2 demoReducer outputAt
  - app/src/pages/PocLanding.tsx 11a61d8c9b07 Home
covers:
  - app/src/pages/reactflow/
  - app/src/pages/tldraw/
  - app/src/pages/PocLanding.tsx
  - app/src/pages/canvas/collaboration-demo/
  - app/src/shared/
---

## 职责

用同一组预设事件比较两种画布实现，同时为产品画布提供卡片、专注窗口和显示档位管理。演示页面只回放本地数据，不启动真实 Agent；共享显示组件仍被真实画布使用，不能把整个目录视为可删除的演示代码。

这一范围超过 20 个文件，职责可概括为“让同一份节点状态适配不同画布并保持一致呈现”。本地事件引擎与两套适配器放在一起，便于比较；真实传输和会话动作另见[实时画布](canvas.md)。

## 对外接口

- `ReactFlowPage`（`app/src/pages/reactflow/index.tsx`）与 `TldrawPage`（`app/src/pages/tldraw/TldrawPage.tsx`）分别承接 `/react-flow`、`/tldraw`，共享本地 `EventEngine`。
- `EventEngine`、`buildSnapshot`（`app/src/shared/mock/engine.ts`）提供播放、暂停、跳转、重置和 1/2/4 倍速；快照由预设节点、边与指定下标之前的事件折叠而成。
- `ViewModeManager`、`modeForScreenWidth`（`app/src/shared/ViewModeManager.ts`）管理 L0/L1/L1s 显示档位、用户显式进入的 L2 专注，以及动画开关。按节点屏幕宽度划档，阈值是 240px、640px，缩放停止 120ms 后重算。
- `FocusOverlay`（`app/src/shared/FocusOverlay.tsx`）把同一个内容容器移到浮窗或视口窗口，使用稳定 portal 容器保留子组件状态。
- `Home`（`app/src/pages/PocLanding.tsx`，路由侧以 `PocLanding` 名称导入）提供原型入口。旧画布占位页已在本次体检修复中删除；实际原型路由仍保留。
- `demoReducer`、`outputAt`（`app/src/pages/canvas/collaboration-demo/model.ts`）描述独立的预设协作剧本；目前未接入浏览器页面，不能写成已上线协作入口。

## 数据怎么流

进入原型页后，各页面创建自己的本地事件引擎和显示管理器。播放时引擎推进事件下标，页面订阅变化，再从事件序列重建节点状态。跳转时间点走同一条重建路径，不需要访问后端或恢复真实进程。

React Flow 页面把快照映射为自定义节点与边；tldraw 页面创建自定义节点形状，再用覆盖层绘制边。两者上报缩放和节点宽度，让共享显示管理器决定摘要、默认或放大视图。专注由用户显式触发，不随缩放自动进入。

真实画布也使用共享的节点外壳、专注窗口与显示档位管理，但状态来自后端。主画布提供工作区命名空间时，显示优先级为专注窗口、单卡覆盖、全局默认；自动模式最后按屏幕宽度决定档位。全局默认保存于本浏览器同源存储，跨标签页同步；单卡覆盖按工作区存储并同步。旧版固定缩略/详细设置在读取时保留，新版区分跟随全局与显式自动；迁移不删除旧记录。无命名空间的原型管理器不继承产品的全局值，演示回放本身不落服务端存储。动画设置默认跟随系统减少动态效果的偏好，也允许用户覆盖。

`GlobalCardViewPreferences` 使用 `canvas.card-view.global.v1` 保存全局 auto/compact/detail，存储不可用时保留内存行为。`ViewModeManager` 使用 `canvas.card-views.v2:<workspaceId>` 保存单卡覆盖；不存在 v2 才回读 v1 的 compact/detail。清除覆盖写入空 v2 对象，防止旧 v1 固定项再次出现。全局及单卡 storage 事件只更新显示，监听随订阅/释放管理，不发送任何会话控制请求。

## 改动指南

- 改演示剧情看 `shared/mock/events.ts` 与 `buildSnapshot`；改真实会话不要往预设事件表添加伪造结果。
- 改显示阈值或卡片偏好看 `ViewModeManager.ts`。产品画布和两套原型共用它，测试要覆盖三个入口。
- `NodeShell` 和 `FocusOverlay` 通过可选 `compactHeader` / `headerActions` 接纳真实聊天的紧凑标题栏；默认值保留原型与 herdr 的身份行及原有标题布局。
- `FocusOverlay` 的内容容器身份必须稳定。切换浮窗、铺满和返回画布应移动现有容器，而不是重建输入框、终端或阅读位置。
- 原型界面的审批覆盖只影响本地快照，不等同于后端审批。新增真实审批仍走会话交互模块。
- 旧画布占位页已删除；`collaboration-demo/model.ts` 仍是未接入的预设剧本。不要按目录名批量删除 `shared/`。
